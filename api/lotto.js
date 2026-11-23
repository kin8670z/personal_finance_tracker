// 로또 6/45 당첨번호 (재미용 통계·추천 페이지에서 사용)
// 전체 회차는 공개 모음(GitHub smok95/lotto)에서, 그 뒤 최신 회차는 동행복권 공식 응답으로 채운다.
//   GET /api/lotto → { draws: [[회차, 'YYYY-MM-DD', n1..n6, 보너스, 1등 1인당 금액, 1등 인원]], latest: {...},
//                      prizes: { 회차: { d: [[1인당 금액, 인원] × 1~5등], s: 총 판매액, c: { auto, manual, semi } } } (최근 회차만) }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ok = (nums, bonus) => Array.isArray(nums) && nums.length === 6 && new Set(nums).size === 6 && nums.every(n => Number.isInteger(n) && n >= 1 && n <= 45) && Number.isInteger(bonus) && bonus >= 1 && bonus <= 45 && !nums.includes(bonus);

async function mirror() {
  const r = await fetch('https://smok95.github.io/lotto/results/all.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('mirror ' + r.status);
  const all = await r.json(), out = [], meta = {}, prizes = {};
  for (const d of all) {
    const nums = (d.numbers || []).slice().sort((a, b) => a - b);
    if (!ok(nums, d.bonus_no)) continue;
    const first = (d.divisions || [])[0] || {};
    out.push([d.draw_no, String(d.date || '').slice(0, 10), ...nums, d.bonus_no, first.prize ?? null, first.winners ?? null]);
    meta[d.draw_no] = { prize1: first.prize || null, winners1: first.winners ?? null };
    if ((d.divisions || []).length >= 5) prizes[d.draw_no] = { d: d.divisions.slice(0, 5).map(x => [x.prize ?? null, x.winners ?? null]), s: d.total_sales_amount ?? null, c: d.winners_combination || null };
  }
  return { draws: out, meta, prizes };
}
async function official(no) {
  const r = await fetch(`https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=${no}`, { headers: { 'User-Agent': UA, Referer: 'https://www.dhlottery.co.kr/' }, redirect: 'manual', signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const d = (((await r.json()) || {}).data || {}).list?.[0];
  if (!d || d.ltEpsd !== no) return null;
  const nums = [d.tm1WnNo, d.tm2WnNo, d.tm3WnNo, d.tm4WnNo, d.tm5WnNo, d.tm6WnNo].sort((a, b) => a - b);
  if (!ok(nums, d.bnsWnNo)) return null;
  const ymd = String(d.ltRflYmd || '');
  const div = [1, 2, 3, 4, 5].map(i => [d[`rnk${i}WnAmt`] ?? null, d[`rnk${i}WnNope`] ?? null]);
  return { prize: div.every(x => x[0] != null) ? { d: div, s: d.wholEpsdSumNtslAmt ?? d.rlvtEpsdSumNtslAmt ?? null, c: null } : null, row: [no, `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`, ...nums, d.bnsWnNo, d.rnk1WnAmt ?? null, d.rnk1WnNope ?? null], meta: { prize1: d.rnk1WnAmt ?? null, winners1: d.rnk1WnNope ?? null } };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const { draws, meta, prizes } = await mirror();
    draws.sort((a, b) => a[0] - b[0]);
    // 모음이 늦게 갱신됐을 수 있어서 다음 두 회차는 공식 응답으로 확인
    let next = (draws.length ? draws[draws.length - 1][0] : 0) + 1;
    for (let i = 0; i < 2; i++, next++) {
      const o = await official(next).catch(() => null);
      if (!o) break;
      draws.push(o.row); meta[next] = o.meta; if (o.prize) prizes[next] = o.prize;
    }
    const last = draws[draws.length - 1];
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    // 당첨금 상세는 최근 200회만 (응답 크기)
    const cut = (last ? last[0] : 0) - 200, recent = {};
    Object.keys(prizes).forEach(k => { if (+k > cut) recent[k] = prizes[k]; });
    res.end(JSON.stringify({ prizes: recent, draws, latest: last ? { no: last[0], date: last[1], nums: last.slice(2, 8), bonus: last[8], ...(meta[last[0]] || {}) } : null }));
  } catch (e) {
    console.error(e.message);
    res.statusCode = 502; res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: '당첨번호를 불러오지 못했어요' }));
  }
};
