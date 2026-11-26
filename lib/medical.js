// 지금 문 연 병원·약국 — 국립중앙의료원 (공공데이터포털)
//   GET /api/food?svc=medical&kind=ped  (Vercel Hobby 함수 12개 제한 때문에 api/food.js가 넘겨줌)&sido=경기도&city=하남시 → { items: [{ id, name, addr, tel, div, lat, lon, t: { 1: ['0900','1800'], … 8 } }] }
//   kind: ped 소아청소년과 · ent 이비인후과 · im 내과 · fm 가정의학과 · os 정형외과 · derm 피부과 · eye 안과 · pharm 약국
// 키: Vercel 환경변수 DATA_GO_KR_KEY (없으면 MFDS_KEY — 같은 공공데이터포털 계정 키). 서비스마다 활용신청 필요:
//   · 국립중앙의료원_전국 병·의원 찾기 서비스 (HsptlAsembySearchService)
//   · 국립중앙의료원_전국 약국 정보 조회 서비스 (ErmctInsttInfoInqireService)
const HOSP = 'https://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire';
const PHARM = 'https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire';
const DEPT = { ped: 'D002', ent: 'D013', im: 'D001', fm: 'D022', os: 'D008', derm: 'D005', eye: 'D012' };

function send(res, status, body, maxAge) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', status === 200 ? `public, s-maxage=${maxAge || 43200}, stale-while-revalidate=86400` : 'no-store');
  res.end(JSON.stringify(body));
}
const unx = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const tag = (x, k) => { const m = x.match(new RegExp(`<${k}>([\\s\\S]*?)</${k}>`)); return m ? unx(m[1]) : ''; };
const hhmm = v => { const s = String(v || '').replace(/\D/g, ''); return s.length >= 3 ? s.padStart(4, '0') : ''; };

module.exports = async (req, res) => {
  const p = new URL(req.url, 'http://localhost').searchParams;
  const kind = String(p.get('kind') || 'ped'), sido = String(p.get('sido') || '경기도').slice(0, 10), city = String(p.get('city') || '하남시').slice(0, 10);
  if (kind !== 'pharm' && !DEPT[kind]) return send(res, 400, { error: '종류가 이상해요' });
  const key = process.env.DATA_GO_KR_KEY || process.env.MFDS_KEY;
  if (!key) return send(res, 200, { needKey: true, items: [] }, 60);
  const k = /%[0-9A-F]{2}/i.test(key) ? key : encodeURIComponent(key);
  const q = `serviceKey=${k}&Q0=${encodeURIComponent(sido)}&Q1=${encodeURIComponent(city)}&ORD=NAME&pageNo=1&numOfRows=${kind === 'pharm' ? 500 : 200}`;
  const url = kind === 'pharm' ? `${PHARM}?${q}` : `${HOSP}?${q}&QD=${DEPT[kind]}`;
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch(url, { signal: ctl.signal }); clearTimeout(to);
    const x = await r.text();
    const code = tag(x, 'resultCode') || tag(x, 'returnReasonCode');
    if (!/<item>/.test(x) && code && code !== '00') {
      const msg = tag(x, 'resultMsg') || tag(x, 'returnAuthMsg') || code;
      const notReg = /NOT_REGISTERED|ACCESS.DENIED/i.test(msg) || code === '30' || code === '20';
      return send(res, 502, { error: notReg ? '공공데이터포털에서 이 서비스 활용신청이 필요해요' : `조회 실패 (${msg})`, needApply: notReg });
    }
    const items = (x.match(/<item>[\s\S]*?<\/item>/g) || []).map(it => {
      const t = {};
      for (let d = 1; d <= 8; d++) { const s = hhmm(tag(it, `dutyTime${d}s`)), c = hhmm(tag(it, `dutyTime${d}c`)); if (s && c) t[d] = [s, c]; }
      return { id: tag(it, 'hpid'), name: tag(it, 'dutyName'), addr: tag(it, 'dutyAddr'), tel: tag(it, 'dutyTel1'), div: tag(it, 'dutyDivNam'), lat: Number(tag(it, 'wgs84Lat')) || null, lon: Number(tag(it, 'wgs84Lon')) || null, t };
    }).filter(i => i.name);
    return send(res, 200, { items, total: Number(tag(x, 'totalCount')) || items.length });
  } catch (e) {
    return send(res, 502, { error: e.name === 'AbortError' ? '공공데이터포털이 늦어요. 잠시 뒤 다시' : '조회 실패' });
  }
};
