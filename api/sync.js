// 기기 간 동기화 저장소 (Upstash Redis)
// 서버는 암호문만 보관한다. 암호화·복호화는 전부 브라우저(sync.js)에서 하고,
// 비밀번호·복구 코드·데이터 키는 서버로 오지 않는다.
//
//   GET  /api/sync?op=ping                     연결 확인
//   GET  /api/sync?op=meta&id=ID               비밀번호로 데이터 키를 풀기 위한 정보(암호화된 키, salt)
//   POST /api/sync {op:'create', id, meta, tokenHash, blob}
//   POST /api/sync {op:'pull',   id, token}
//   POST /api/sync {op:'push',   id, token, baseRev, force, blob}
//   POST /api/sync {op:'rekey',  id, token, meta}          비밀번호 변경(복구)
//   POST /api/sync {op:'restore',id, token}                서버의 바로 전 버전으로 되돌리기
//   POST /api/sync {op:'delete', id, token}                서버 데이터 삭제
const crypto = require('crypto');

const ID_RE = /^[A-Z2-7]{16}$/;
const MAX_BLOB = 3 * 1024 * 1024;   // 암호문(base64) 최대 3MB
const MAX_META = 8 * 1024;
const PREFIX = 'argon:sync:';

function creds() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  };
}
async function redis(cmds) {
  const { url, token } = creds();
  if (!url || !token) throw Object.assign(new Error('동기화 저장소가 연결되지 않았어요'), { status: 503 });
  const r = await fetch(`${url}/pipeline`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds), signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw Object.assign(new Error(`저장소 오류 (${r.status})`), { status: r.status === 413 ? 413 : 502 });
  const out = await r.json();
  return out.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}
const k = (id, part) => `${PREFIX}${id}:${part}`;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
function same(a, b) { const x = Buffer.from(a || ''), y = Buffer.from(b || ''); return x.length === y.length && crypto.timingSafeEqual(x, y); }

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BLOB + 64 * 1024) throw Object.assign(new Error('데이터가 너무 커요'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) { throw Object.assign(new Error('잘못된 요청'), { status: 400 }); }
}
function checkBlob(b) {
  if (!b || typeof b.iv !== 'string' || typeof b.ct !== 'string' || b.iv.length > 64) throw Object.assign(new Error('잘못된 데이터'), { status: 400 });
  if (b.ct.length > MAX_BLOB) throw Object.assign(new Error('데이터가 너무 커요 (3MB 이하)'), { status: 413 });
  return { iv: b.iv, ct: b.ct, device: String(b.device || '').slice(0, 40) };
}
async function auth(id, token) {
  if (!ID_RE.test(id || '')) throw Object.assign(new Error('잘못된 동기화 ID'), { status: 400 });
  const [h] = await redis([['GET', k(id, 'auth')]]);
  if (!h) throw Object.assign(new Error('동기화 정보를 찾을 수 없어요'), { status: 404 });
  if (!token || !same(sha(token), h)) throw Object.assign(new Error('인증에 실패했어요'), { status: 403 });
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const q = new URL(req.url, 'http://localhost').searchParams, op = q.get('op');
      if (op === 'ping') {
        const { url, token } = creds();
        if (!url || !token) return send(res, 200, { configured: false });
        const [p] = await redis([['PING']]);
        return send(res, 200, { configured: true, ping: p });
      }
      if (op === 'meta') {
        const id = String(q.get('id') || '').toUpperCase();
        if (!ID_RE.test(id)) return send(res, 400, { error: '잘못된 동기화 ID' });
        const [m] = await redis([['GET', k(id, 'meta')]]);
        if (!m) return send(res, 404, { error: '이 ID로 만든 동기화가 없어요' });
        return send(res, 200, { meta: JSON.parse(m) });
      }
      return send(res, 400, { error: '알 수 없는 요청' });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'POST만 돼요' });

    const b = await readBody(req), op = b.op, id = String(b.id || '').toUpperCase();
    if (op === 'create') {
      if (!ID_RE.test(id)) return send(res, 400, { error: '잘못된 동기화 ID' });
      const meta = JSON.stringify(b.meta || {});
      if (meta.length > MAX_META || !/^[0-9a-f]{64}$/.test(b.tokenHash || '')) return send(res, 400, { error: '잘못된 요청' });
      const blob = checkBlob(b.blob), now = new Date().toISOString();
      const [ok] = await redis([['SET', k(id, 'auth'), b.tokenHash, 'NX']]);
      if (ok !== 'OK') return send(res, 409, { error: '이미 있는 ID예요' });
      await redis([['SET', k(id, 'meta'), meta], ['SET', k(id, 'blob'), JSON.stringify({ ...blob, rev: 1, updatedAt: now })]]);
      return send(res, 200, { rev: 1, updatedAt: now });
    }
    await auth(id, b.token);
    if (op === 'pull') {
      const [cur] = await redis([['GET', k(id, 'blob')]]);
      return send(res, 200, cur ? JSON.parse(cur) : { rev: 0 });
    }
    if (op === 'push') {
      const blob = checkBlob(b.blob);
      const [curRaw] = await redis([['GET', k(id, 'blob')]]);
      const cur = curRaw ? JSON.parse(curRaw) : { rev: 0 };
      if (!b.force && Number(b.baseRev) !== cur.rev) return send(res, 409, { error: '다른 기기에서 먼저 바뀌었어요', rev: cur.rev, updatedAt: cur.updatedAt, device: cur.device });
      const next = { ...blob, rev: cur.rev + 1, updatedAt: new Date().toISOString() };
      const cmds = [['SET', k(id, 'blob'), JSON.stringify(next)]];
      if (curRaw) cmds.unshift(['SET', k(id, 'prev'), curRaw]);   // 바로 전 버전 1개 보관
      await redis(cmds);
      return send(res, 200, { rev: next.rev, updatedAt: next.updatedAt });
    }
    if (op === 'restore') {
      const [prevRaw, curRaw] = await redis([['GET', k(id, 'prev')], ['GET', k(id, 'blob')]]);
      if (!prevRaw) return send(res, 404, { error: '되돌릴 이전 버전이 없어요' });
      const cur = JSON.parse(curRaw), prev = JSON.parse(prevRaw);
      const next = { ...prev, rev: cur.rev + 1, updatedAt: new Date().toISOString() };
      await redis([['SET', k(id, 'prev'), curRaw], ['SET', k(id, 'blob'), JSON.stringify(next)]]);
      return send(res, 200, next);
    }
    if (op === 'rekey') {
      const meta = JSON.stringify(b.meta || {});
      if (meta.length > MAX_META) return send(res, 400, { error: '잘못된 요청' });
      await redis([['SET', k(id, 'meta'), meta]]);
      return send(res, 200, { ok: true });
    }
    if (op === 'delete') {
      await redis([['DEL', k(id, 'auth'), k(id, 'meta'), k(id, 'blob'), k(id, 'prev')]]);
      return send(res, 200, { ok: true });
    }
    return send(res, 400, { error: '알 수 없는 요청' });
  } catch (e) {
    console.error(e.message);
    return send(res, e.status || 500, { error: e.status ? e.message : '서버 오류가 났어요' });
  }
};
