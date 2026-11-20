// 기기 간 동기화용 저장소 (Upstash Redis) — 지금은 연결 확인(op=ping)만
// 키 값은 절대 응답에 넣지 않는다.
function creds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token, via: process.env.KV_REST_API_URL ? 'KV_REST_API_*' : process.env.UPSTASH_REDIS_REST_URL ? 'UPSTASH_REDIS_REST_*' : null };
}
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const { url, token, via } = creds();
  const out = { configured: !!(url && token), via, env: process.env.VERCEL_ENV || null };
  if (out.configured) {
    try {
      const r = await fetch(`${url}/ping`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
      const j = await r.json().catch(() => ({}));
      out.ping = r.ok ? j.result : `HTTP ${r.status}`;
    } catch (e) { out.ping = 'error: ' + e.message; }
  }
  res.end(JSON.stringify(out));
};
