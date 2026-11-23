// 지하철 열차 시간표 (서울 열린데이터광장, 서울교통공사 시간표)
//   GET /api/timetable?station=미사&week=1 → { station, week, lines: [{ line, dirs: [{ tag, name, trains: [['06:14', '하남검단산', 0]] }] }] }
//   week: 1 평일 · 2 토요일 · 3 휴일(일요일·공휴일)
// 인증키는 Vercel 환경변수 SEOUL_OPENAPI_KEY (실시간 키와 다른 '일반 인증키').
const NAME_RE = /^[가-힣0-9A-Za-z()·.\s]{1,20}$/;
const codeCache = new Map();
// 노선마다 이름이 다른 같은 역 (시간표 API에서 따로 등록됨): 이수(7호선) = 총신대입구(4호선)
const ALIAS = { '이수': ['총신대입구'], '총신대입구': ['이수'] };

async function getJson(url) {
  let last;
  for (let i = 0; i < 2; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); return await r.json(); } catch (e) { last = e; }
  }
  throw last;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (status, body, cache) => { res.statusCode = status; res.setHeader('Cache-Control', cache || 'no-store'); res.end(JSON.stringify(body)); };
  const q = new URL(req.url, 'http://localhost').searchParams;
  let station = String(q.get('station') || '').trim().replace(/\s+/g, '');
  if (station !== '서울역') station = station.replace(/역$/, '');
  if (station === '서울역') station = '서울';
  const week = ['1', '2', '3'].includes(q.get('week')) ? q.get('week') : '1';
  if (!station || !NAME_RE.test(station)) return send(400, { error: '역 이름을 확인해 주세요' });
  const key = process.env.SEOUL_OPENAPI_KEY;
  if (!key) return send(200, { station, needKey: true, lines: [] });
  const B = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json`;
  try {
    // 역 이름 → 역코드 (환승역은 노선마다 하나씩)
    let rows = codeCache.get(station);
    if (!rows) {
      rows = [];
      const first = station === '서울' ? ['서울역', '서울'] : [station];
      for (const nm of first) {
        const j = await getJson(`${B}/SearchInfoBySubwayNameService/1/20/${encodeURIComponent(nm)}/`);
        rows = ((j.SearchInfoBySubwayNameService || {}).row || []);
        if (rows.length) break;
      }
      for (const nm of ALIAS[station] || []) {
        const j = await getJson(`${B}/SearchInfoBySubwayNameService/1/20/${encodeURIComponent(nm)}/`);
        ((j.SearchInfoBySubwayNameService || {}).row || []).forEach(r => { if (!rows.some(x => x.STATION_CD === r.STATION_CD)) rows.push(r); });
      }
      codeCache.set(station, rows);
    }
    if (!rows.length) return send(200, { station, week, notFound: true, lines: [] }, 'public, s-maxage=3600');

    const lines = await Promise.all(rows.map(async row => {
      const dirs = await Promise.all(['1', '2'].map(async tag => {
        const j = await getJson(`${B}/SearchSTNTimeTableByIDService/1/400/${row.STATION_CD}/${week}/${tag}/`);
        const list = ((j.SearchSTNTimeTableByIDService || {}).row || [])
          .map(t => {
            const time = t.LEFTTIME && t.LEFTTIME !== '00:00:00' ? t.LEFTTIME : t.ARRIVETIME;
            // 5번째 값 1 = 이 역에서 끝나는 열차 (탈 수는 없지만, 종점 도착 시각 계산엔 필요)
            return [time.slice(0, 5), t.SUBWAYENAME || '', t.EXPRESS_YN === 'D' || t.EXPRESS_YN === 'Y' ? 1 : 0, t.TRAIN_NO || '', t.DESTSTATION === row.STATION_CD ? 1 : 0];
          })
          .filter(t => t[0] && t[0] !== '00:00');
        // 새벽 0~3시는 그날 밤 막차 쪽으로 정렬
        const k = t => { const [h, m] = t[0].split(':').map(Number); return (h < 4 ? h + 24 : h) * 60 + m; };
        list.sort((a, b) => k(a) - k(b));
        // 방향 이름: 가장 많이 가는 종착역
        const cnt = {}; list.filter(t => !t[4]).forEach(t => cnt[t[1]] = (cnt[t[1]] || 0) + 1);
        const main = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
        return { tag, name: main ? `${main[0]} 방면` : (tag === '1' ? '상행' : '하행'), trains: list };
      }));
      const line = String(row.LINE_NUM || '').replace(/^0/, '');
      // 2호선 순환선처럼 두 방향 종착역이 같으면 상행/하행(2호선은 내선/외선)으로
      if (dirs.length === 2 && dirs[0].name === dirs[1].name) dirs.forEach(d => { d.name = line === '2호선' ? (d.tag === '1' ? '내선순환' : '외선순환') : (d.tag === '1' ? '상행' : '하행'); });
      return { line, code: row.STATION_CD, dirs: dirs.filter(d => d.trains.length) };
    }));
    const usable = lines.filter(l => l.dirs.length);
    return send(200, { station, week, lines: usable }, 'public, s-maxage=86400, stale-while-revalidate=604800');
  } catch (e) {
    const why = (e && (e.cause && e.cause.code || e.name)) || 'unknown';
    return send(502, { error: '시간표 서버가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요', why: String(why).slice(0, 40) });
  }
};
