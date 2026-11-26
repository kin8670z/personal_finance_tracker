// 식약처 「조리식품의 레시피 DB」(식품안전나라 Open API, 서비스 COOKRCP01) — 키는 Vercel 환경변수 FOODSAFETY_KEY
//   GET /api/recipe?op=list            → 전체 레시피 목록(가벼운 정보만, 하루 캐시) { items: [{ id, name, type, way, kcal, img, parts, tag }] }
//   GET /api/recipe?op=get&name=두부조림 → 만드는 법 포함 상세
//   GET /api/recipe?op=list&debug=1    → 연결 확인
// API 호출 제한(하루 1000회)이 있어서 CDN 캐시를 길게 둔다. 키는 응답에 절대 넣지 않는다.
const BASES = ['https://openapi.foodsafetykorea.go.kr/api', 'http://openapi.foodsafetykorea.go.kr/api'];
function send(res, status, body, maxAge) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', status === 200 ? `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 7}` : 'no-store');
  res.end(JSON.stringify(body));
}
const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : null; };
const https = u => String(u || '').trim().replace(/^http:\/\//, 'https://');
async function call(key, start, end, cond) {
  let last = '';
  for (const b of BASES) {
    try {
      const r = await fetch(`${b}/${encodeURIComponent(key)}/COOKRCP01/json/${start}/${end}${cond ? '/' + cond : ''}`, { signal: AbortSignal.timeout(12000) });
      const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { last = `${r.status} ${t.slice(0, 120)}`; continue; }
      const c = j.COOKRCP01 || {}, res = c.RESULT || j.RESULT || {};
      if (res.CODE && res.CODE !== 'INFO-000') { if (res.CODE === 'INFO-200') return { rows: [], total: 0 }; last = `${res.CODE} ${res.MSG || ''}`; continue; }
      return { rows: c.row || [], total: +c.total_count || 0 };
    } catch (e) { last = e.message; }
  }
  throw new Error(last.replace(key, '***'));
}
const brief = r => ({ id: r.RCP_SEQ, name: String(r.RCP_NM || '').trim(), type: r.RCP_PAT2 || '', way: r.RCP_WAY2 || '', kcal: num(r.INFO_ENG), img: https(r.ATT_FILE_NO_MK || r.ATT_FILE_NO_MAIN), parts: String(r.RCP_PARTS_DTLS || '').replace(/\s+/g, ' ').trim().slice(0, 400), tag: r.HASH_TAG || '' });
function full(r) {
  const steps = [];
  for (let i = 1; i <= 20; i++) { const k = String(i).padStart(2, '0'), t = String(r['MANUAL' + k] || '').replace(/\s+/g, ' ').trim(); if (t) steps.push({ t: t.replace(/[a-z]$/, '').replace(/^\d+\.\s*/, ''), img: https(r['MANUAL_IMG' + k]) }); }
  return Object.assign(brief(r), { imgL: https(r.ATT_FILE_NO_MAIN || r.ATT_FILE_NO_MK), weight: num(r.INFO_WGT), carb: num(r.INFO_CAR), pro: num(r.INFO_PRO), fat: num(r.INFO_FAT), na: num(r.INFO_NA), partsFull: String(r.RCP_PARTS_DTLS || '').trim(), steps, tip: String(r.RCP_NA_TIP || '').trim() });
}
module.exports = async (req, res) => {
  const p = new URL(req.url, 'http://localhost').searchParams, key = process.env.FOODSAFETY_KEY;
  if (!key) return send(res, 200, { needKey: true, items: [] }, 60);
  try {
    if (p.get('op') === 'get') {
      const name = String(p.get('name') || '').trim().slice(0, 40), id = String(p.get('id') || '');
      if (!name) return send(res, 400, { error: '이름이 필요해요' });
      const { rows } = await call(key, 1, 30, `RCP_NM=${encodeURIComponent(name)}`);
      const r = rows.find(x => String(x.RCP_SEQ) === id) || rows.find(x => String(x.RCP_NM).trim() === name) || rows[0];
      return r ? send(res, 200, { item: full(r) }, 7 * 86400) : send(res, 404, { error: '레시피를 찾지 못했어요' });
    }
    // 목록: 1~1000, 1001~2000 … 끝까지 (보통 1,100여 개)
    const first = await call(key, 1, 1000), rows = [...first.rows];
    if (p.get('debug') === '1') return send(res, 200, { total: first.total, got: rows.length, keys: rows[0] ? Object.keys(rows[0]) : [], sample: rows[0] ? brief(rows[0]) : null }, 0);
    for (let s = 1001; s <= Math.min(first.total, 5000); s += 1000) rows.push(...(await call(key, s, s + 999)).rows);
    const seen = new Set(), items = rows.map(brief).filter(x => x.name && !seen.has(x.id) && seen.add(x.id));
    return send(res, 200, { items, total: items.length }, 86400);
  } catch (e) {
    console.error('recipe', e.message);
    return send(res, 502, { error: '레시피 DB에 연결하지 못했어요', detail: /INFO-300|인증키|KEY/i.test(e.message) ? '인증키를 확인해 주세요 (승인까지 시간이 걸릴 수 있어요)' : e.message.slice(0, 160) });
  }
};
