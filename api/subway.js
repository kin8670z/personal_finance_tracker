// 서울시 실시간 지하철 도착 정보 (서울 열린데이터광장)
//   GET /api/subway?station=강남 → { station, demo, arrivals: [...] }
// 인증키는 Vercel 환경변수 SEOUL_SUBWAY_KEY. 없으면 공개 테스트 키(sample)라 '서울'역만 조회된다.
const LINES = {
  1001: ['1호선', '#0052A4'], 1002: ['2호선', '#00A84D'], 1003: ['3호선', '#EF7C1C'], 1004: ['4호선', '#00A5DE'], 1005: ['5호선', '#996CAC'],
  1006: ['6호선', '#CD7C2F'], 1007: ['7호선', '#747F00'], 1008: ['8호선', '#E6186C'], 1009: ['9호선', '#BDB092'], 1032: ['GTX-A', '#9A6292'],
  1061: ['중앙선', '#77C4A3'], 1063: ['경의중앙선', '#77C4A3'], 1065: ['공항철도', '#0090D2'], 1067: ['경춘선', '#0C8E72'], 1075: ['수인분당선', '#FABE00'],
  1077: ['신분당선', '#D4003B'], 1081: ['경강선', '#0054A6'], 1092: ['우이신설선', '#B0CE18'], 1093: ['서해선', '#81A914'], 1094: ['신림선', '#6789CA']
};
const NAME_RE = /^[가-힣0-9A-Za-z()·.\s]{1,20}$/;

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (status, body, cache) => { res.statusCode = status; res.setHeader('Cache-Control', cache || 'no-store'); res.end(JSON.stringify(body)); };
  const q = new URL(req.url, 'http://localhost').searchParams;
  let station = String(q.get('station') || '').trim().replace(/\s+/g, '');
  if (station !== '서울역') station = station.replace(/역$/, '');   // '강남역' → '강남' (서울역은 '서울')
  if (station === '서울역') station = '서울';
  if (!station || !NAME_RE.test(station)) return send(400, { error: '역 이름을 확인해 주세요' });
  const key = process.env.SEOUL_SUBWAY_KEY || 'sample', demo = key === 'sample';
  if (demo && station !== '서울') return send(200, { station, demo, needKey: true, arrivals: [] });
  try {
    const r = await fetch(`http://swopenAPI.seoul.go.kr/api/subway/${encodeURIComponent(key)}/json/realtimeStationArrival/0/40/${encodeURIComponent(station)}`, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    const err = j.errorMessage || j;
    if (err && err.code && err.code !== 'INFO-000') {
      if (err.code === 'INFO-200') return send(200, { station, demo, arrivals: [], notFound: true }, 'public, s-maxage=15');
      if (err.code === 'INFO-100') return send(200, { station, demo, needKey: true, badKey: true, arrivals: [] });
      return send(502, { error: err.message || '지하철 정보를 불러오지 못했어요' });
    }
    const arrivals = (j.realtimeArrivalList || []).map(a => {
      const [lineName, color] = LINES[a.subwayId] || [a.subwayNm || '지하철', '#64748b'];
      return {
        line: a.subwayId, lineName, color, dir: a.updnLine, to: a.trainLineNm, dest: a.bstatnNm,
        msg: a.arvlMsg2, now: a.arvlMsg3, code: a.arvlCd, sec: Number(a.barvlDt) || 0,
        express: a.btrainSttus && a.btrainSttus !== '일반' ? a.btrainSttus : null, last: a.lstcarAt === '1',
        order: a.ordkey, at: a.recptnDt
      };
    });
    return send(200, { station, demo, arrivals, at: new Date().toISOString() }, 'public, s-maxage=10, stale-while-revalidate=20');
  } catch (e) {
    console.error(e.message);
    return send(502, { error: '지하철 정보를 불러오지 못했어요' });
  }
};
