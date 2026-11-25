// 든든 아침 알림 (Web Push)
// 서버는 "알림 보내!" 신호만 보낸다 (내용 없는 push). 알림 문구는 휴대폰의 서비스 워커가
// 기기 안에 있는 기프티콘·D-Day·할 일 데이터로 직접 만든다 → 개인 데이터는 서버로 안 온다.
//
//   GET  /api/push?op=key                  VAPID 공개키 (처음 한 번 서버가 만들어 Upstash에 보관)
//   POST /api/push {op:'sub',   sub}       구독 저장
//   POST /api/push {op:'unsub', endpoint}  구독 삭제
//   POST /api/push {op:'test',  endpoint}  이 기기로 테스트 알림
//   GET  /api/push?op=cron                 Vercel Cron (매일 아침) → 모든 구독에 알림
const crypto = require('crypto');

const P = 'argon:push:';
const HOSTS = [/\.googleapis\.com$/, /\.mozilla\.com$/, /\.mozaws\.net$/, /\.windows\.com$/, /\.push\.apple\.com$/, /^web\.push\.apple\.com$/];
const SUBJECT = 'https://personalfinancetracker-topaz.vercel.app';

async function redis(cmds) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL, token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw Object.assign(new Error('저장소가 연결되지 않았어요'), { status: 503 });
  const r = await fetch(`${url}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw Object.assign(new Error(`저장소 오류 (${r.status})`), { status: 502 });
  return (await r.json()).map(x => { if (x.error) throw new Error(x.error); return x.result; });
}
const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 24);

// VAPID 키: 없으면 만들어서 저장 (동시에 두 번 만들어져도 SET NX라 먼저 저장된 것만 씀)
async function vapid() {
  let [jwk] = await redis([['GET', P + 'vapid']]);
  if (!jwk) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    await redis([['SET', P + 'vapid', JSON.stringify(privateKey.export({ format: 'jwk' })), 'NX']]);
    [jwk] = await redis([['GET', P + 'vapid']]);
  }
  const j = JSON.parse(jwk);
  const pub = b64u(Buffer.concat([Buffer.from([4]), Buffer.from(j.x, 'base64url'), Buffer.from(j.y, 'base64url')]));
  return { pub, key: crypto.createPrivateKey({ key: j, format: 'jwk' }) };
}
function okEndpoint(e) {
  try { const u = new URL(e); return u.protocol === 'https:' && HOSTS.some(re => re.test(u.hostname)) && e.length < 1000; } catch (x) { return false; }
}
// 내용 없는 push 한 건 보내기 → 상태 코드
async function send(v, endpoint) {
  const u = new URL(endpoint), enc = o => b64u(JSON.stringify(o));
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: u.origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT })}`;
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key: v.key, dsaEncoding: 'ieee-p1363' });
  const r = await fetch(endpoint, { method: 'POST', headers: { Authorization: `vapid t=${unsigned}.${b64u(sig)}, k=${v.pub}`, TTL: '43200', Urgency: 'high', 'Content-Length': '0' }, signal: AbortSignal.timeout(8000) });
  return r.status;
}
function reply(res, status, body) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); }
async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let s = ''; for await (const c of req) { s += c; if (s.length > 4096) break; }
  try { return JSON.parse(s || '{}'); } catch (e) { return {}; }
}

module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://localhost').searchParams;
  try {
    if (req.method === 'GET' && q.get('op') === 'key') return reply(res, 200, { key: (await vapid()).pub });

    if (req.method === 'GET' && q.get('op') === 'cron') {
      const auth = req.headers.authorization || '', secret = process.env.CRON_SECRET;
      const fromCron = secret ? auth === `Bearer ${secret}` : /^vercel-cron/.test(req.headers['user-agent'] || '');
      if (!fromCron) return reply(res, 401, { error: 'cron only' });
      const [first] = await redis([['SET', P + 'sent', new Date().toISOString(), 'NX', 'EX', 20 * 3600]]);
      if (first !== 'OK') return reply(res, 200, { skipped: 'already sent today' });
      const [all] = await redis([['HGETALL', P + 'subs']]), v = await vapid();
      const subs = []; for (let i = 0; i < (all || []).length; i += 2) subs.push([all[i], JSON.parse(all[i + 1])]);
      const codes = await Promise.all(subs.map(([, s]) => send(v, s.endpoint).catch(() => 0)));
      const dead = subs.filter((_, i) => codes[i] === 404 || codes[i] === 410).map(([id]) => id);
      if (dead.length) await redis([['HDEL', P + 'subs', ...dead]]);
      return reply(res, 200, { sent: codes.filter(c => c >= 200 && c < 300).length, total: subs.length, removed: dead.length });
    }

    if (req.method !== 'POST') return reply(res, 405, { error: 'method' });
    const b = await body(req), endpoint = String((b.sub && b.sub.endpoint) || b.endpoint || '');
    if (!okEndpoint(endpoint)) return reply(res, 400, { error: '알림 주소가 올바르지 않아요' });
    const id = sha(endpoint);
    if (b.op === 'sub') {
      const [n] = await redis([['HLEN', P + 'subs']]);
      if (n >= 20) return reply(res, 429, { error: '등록된 기기가 너무 많아요' });
      await redis([['HSET', P + 'subs', id, JSON.stringify({ endpoint, at: Date.now() })]]);
      return reply(res, 200, { ok: true });
    }
    if (b.op === 'unsub') { await redis([['HDEL', P + 'subs', id]]); return reply(res, 200, { ok: true }); }
    if (b.op === 'test') {
      const [has, fresh] = await redis([['HEXISTS', P + 'subs', id], ['SET', P + 'test:' + id, '1', 'NX', 'EX', 10]]);
      if (!has) return reply(res, 404, { error: '이 기기는 알림이 꺼져 있어요' });
      if (fresh !== 'OK') return reply(res, 429, { error: '잠깐 뒤에 다시 눌러주세요' });
      const code = await send(await vapid(), endpoint);
      if (code === 404 || code === 410) { await redis([['HDEL', P + 'subs', id]]); return reply(res, 410, { error: '알림 등록이 만료됐어요. 다시 켜주세요' }); }
      return code >= 200 && code < 300 ? reply(res, 200, { status: code }) : reply(res, 502, { error: `푸시 서버 응답 ${code}` });
    }
    return reply(res, 400, { error: 'op' });
  } catch (e) {
    console.error(e.message);
    return reply(res, e.status || 500, { error: e.status ? e.message : '알림 서버 오류' });
  }
};
