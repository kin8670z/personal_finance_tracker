// 식약처 식품영양성분DB (공공데이터포털) 검색 — 키는 Vercel 환경변수 MFDS_KEY
//   GET /api/food?q=신라면 → { items: [{ name, kcal, per, weight, maker, cat }], total }
// 활용신청한 서비스는 03 (2026.11 확인), 02는 예전 키 대비
const EP = [
  'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03',
  'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02'
];
function send(res, status, body, maxAge) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', status === 200 ? `public, s-maxage=${maxAge || 86400}, stale-while-revalidate=604800` : 'no-store');
  res.end(JSON.stringify(body));
}
const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : null; };
const pick = (o, ...ks) => { for (const k of ks) if (o[k] != null && o[k] !== '') return o[k]; return ''; };

module.exports = async (req, res) => {
  const p = new URL(req.url, 'http://localhost').searchParams, q = String(p.get('q') || '').trim().slice(0, 40);
  const key = process.env.MFDS_KEY;
  if (!key) return send(res, 200, { needKey: true, items: [] }, 60);
  if (!q) return send(res, 400, { error: '검색어가 필요해요' });
  let lastErr = ''; const errs = [];
  for (const ep of EP) {
    try {
      const k = /%[0-9A-F]{2}/i.test(key) ? key : encodeURIComponent(key);   // Encoding 키를 넣었어도 그대로
      const url = `${ep}?serviceKey=${k}&pageNo=1&numOfRows=40&type=json&FOOD_NM_KR=${encodeURIComponent(q)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
      const text = await r.text();
      if (!r.ok) { lastErr = `HTTP ${r.status} ${(text.match(/(errMsg|returnAuthMsg|resultMsg)[^,}]*/g) || [text.slice(0, 120)]).join(' ').replace(key, '***').replace(k, '***')}`; errs.push(ep.split('/').slice(-2).join('/') + ' ' + lastErr); continue; }
      let j; try { j = JSON.parse(text); } catch (e) { lastErr = text.slice(0, 160).replace(key, '***').replace(k, '***'); errs.push(ep.split('/').slice(-2).join('/') + ' ' + lastErr); continue; }
      const body = j.body || (j.response && j.response.body) || {}, head = j.header || (j.response && j.response.header) || {};
      if (head.resultCode && !/^0+$/.test(String(head.resultCode))) { lastErr = `${head.resultCode} ${head.resultMsg || ''}`; errs.push(ep.split('/').slice(-2).join('/') + ' ' + lastErr); continue; }
      let items = body.items; if (items && items.item) items = items.item; if (!Array.isArray(items)) items = items ? [items] : [];
      if (p.get('debug') === '1') return send(res, 200, { ep: ep.split('/').slice(-2).join('/'), keys: items[0] ? Object.keys(items[0]) : [], sample: items[0] || null, total: body.totalCount }, 0);
      const out = items.map(it => {
        const kcal = num(pick(it, 'AMT_NUM1', 'NUTR_CONT1', 'ENERC_KCAL'));
        return {
          name: String(pick(it, 'FOOD_NM_KR', 'DESC_KOR', 'FOOD_NM')).trim(),
          kcal: kcal == null ? null : Math.round(kcal),
          per: String(pick(it, 'SERVING_SIZE', 'NUTRI_AMOUNT_SERVING', 'SERVING_WT') || '100g'),   // 영양성분 기준량
          weight: String(pick(it, 'Z10500', 'FOOD_SIZE', 'FOOD_WT') || ''),                        // 식품 전체 중량
          maker: String(pick(it, 'MAKER_NM', 'MANUFACTURER', 'IMP_MANUFAC_NM') || '').trim(),
          cat: String(pick(it, 'FOOD_CAT1_NM', 'DB_CLASS_NM', 'FOOD_GROUP') || '').trim()
        };
      }).filter(x => x.name && x.kcal != null)
        // 같은 상품(이름·칼로리·중량) 한 번만, 검색어와 똑같은 이름 → 검색어로 시작 → 짧은 이름 순
        .filter((x, i, a) => a.findIndex(y => y.name === x.name && y.kcal === x.kcal && y.weight === x.weight) === i)
        .map((x, i) => [x, i]).sort(([a, i], [b, j]) => { const r = x => x.name === q ? 0 : x.name.startsWith(q) ? 1 : 2; return r(a) - r(b) || a.name.length - b.name.length || i - j; }).map(([x]) => x);
      return send(res, 200, { items: out, total: body.totalCount || out.length });
    } catch (e) { lastErr = e.message; errs.push(ep.split('/').slice(-2).join('/') + ' ' + e.message); }
  }
  console.error('mfds', errs.join(' | '));
  if (p.get('debug') === '1') return send(res, 502, { errs }, 0);
  return send(res, 502, { error: '식약처 DB에 연결하지 못했어요', detail: /SERVICE_KEY|등록되지|unregistered/i.test(lastErr) ? '키가 아직 활성화 전일 수 있어요 (승인 후 1~2시간)' : lastErr.slice(0, 160) });
};
