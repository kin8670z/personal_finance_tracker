// 임시: 시간표 API 확인용 (머지 전 삭제)
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  const key = process.env.SEOUL_OPENAPI_KEY; const out = { hasKey: !!key, keyLen: key ? key.length : 0 };
  if (!key) return res.end(JSON.stringify(out));
  const q = new URL(req.url, 'http://x').searchParams, name = q.get('name') || '미사', code = q.get('code');
  const get = async u => { try { const r = await fetch(u, { signal: AbortSignal.timeout(6000) }); const t = await r.text(); return t.slice(0, 3000); } catch (e) { return 'ERR ' + (e.cause && e.cause.code || e.name); } };
  const B = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json`;
  out.info = await get(`${B}/SearchInfoBySubwayNameService/1/10/${encodeURIComponent(name)}/`);
  if (code) for (const [w, d] of [[1, 1], [1, 2]]) out['tt' + w + d] = await get(`${B}/SearchSTNTimeTableByIDService/1/8/${code}/${w}/${d}/`);
  res.end(JSON.stringify(out));
};
