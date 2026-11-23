// 임시: 서울시 지하철 API 확인 (머지 전 삭제)
const URLS = [
  'http://swopenAPI.seoul.go.kr/api/subway/sample/json/realtimeStationArrival/0/5/' + encodeURIComponent('서울'),
  'http://swopenAPI.seoul.go.kr/api/subway/sample/json/realtimeStationArrival/0/5/' + encodeURIComponent('하남시청'),
  'http://openapi.seoul.go.kr:8088/sample/json/SearchInfoBySubwayNameService/1/5/' + encodeURIComponent('서울'),
  'http://swopenAPI.seoul.go.kr/api/subway/BADKEY/json/realtimeStationArrival/0/5/' + encodeURIComponent('서울')
];
module.exports = async (req, res) => {
  const out = await Promise.all(URLS.map(async u => { const t = Date.now(); try { const r = await fetch(u, { signal: AbortSignal.timeout(7000) }); const b = await r.text(); return { u: decodeURIComponent(u), s: r.status, ms: Date.now() - t, len: b.length, head: b.slice(0, 1500) }; } catch (e) { return { u, err: String(e) }; } }));
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
};
