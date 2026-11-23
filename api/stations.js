// 수도권 철도역 이름·좌표 (위키데이터, CC0) — 네이버 지도 길찾기 링크에 좌표가 필요해서 사용
//   GET /api/stations → { stations: [[이름, 위도, 경도, '노선, 노선']], at }
// 위키데이터 질의는 무거워서 엣지에 길게 캐시한다.
const UA = 'ArgonAssetApp/1.0 (personal finance tracker; https://personalfinancetracker-topaz.vercel.app)';
const QUERY = `
SELECT ?s ?name ?lat ?lng (GROUP_CONCAT(DISTINCT ?lineName; separator=", ") AS ?lines) WHERE {
  SERVICE wikibase:box {
    ?s wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(126.2 36.7)"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(127.9 38.2)"^^geo:wktLiteral .
  }
  ?s wdt:P31/wdt:P279* wd:Q55488 .
  ?s rdfs:label ?name . FILTER(LANG(?name) = "ko")
  BIND(geof:latitude(?coord) AS ?lat) BIND(geof:longitude(?coord) AS ?lng)
  OPTIONAL { ?s wdt:P81 ?line . ?line rdfs:label ?lineName . FILTER(LANG(?lineName) = "ko") }
  FILTER NOT EXISTS { ?s wdt:P5817 wd:Q811683 }
} GROUP BY ?s ?name ?lat ?lng`;

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(QUERY), { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error('wikidata ' + r.status);
    const j = await r.json(), seen = new Map();
    for (const b of j.results.bindings) {
      const name = b.name.value.trim(), lat = +(+b.lat.value).toFixed(6), lng = +(+b.lng.value).toFixed(6);
      if (!/역$/.test(name) || !isFinite(lat) || !isFinite(lng)) continue;
      const key = `${name}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
      if (!seen.has(key)) seen.set(key, [name, lat, lng, b.lines ? b.lines.value : '']);
    }
    const stations = [...seen.values()].sort((a, b) => a[0].localeCompare(b[0], 'ko'));
    res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000');
    res.end(JSON.stringify({ stations, at: new Date().toISOString() }));
  } catch (e) {
    console.error(e.message);
    res.statusCode = 502; res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: '역 좌표를 불러오지 못했어요' }));
  }
};
