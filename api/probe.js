// 임시: 로또 데이터 소스 확인 (머지 전 삭제)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const URLS = [
  'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=1190',
  'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=1199',
  'https://www.dhlottery.co.kr/gameResult.do?method=allWinExel&gubun=byWin&drwNoStart=1&drwNoEnd=5',
  'https://www.dhlottery.co.kr/gameResult.do?method=byWin',
  'https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=1190',
  'https://smok95.github.io/lotto/results/latest.json',
  'https://smok95.github.io/lotto/results/all.json'
];
module.exports = async (req, res) => {
  const out = await Promise.all(URLS.map(async u => { const t = Date.now(); try { const r = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://www.dhlottery.co.kr/' }, redirect: 'manual', signal: AbortSignal.timeout(7000) }); const b = await r.text(); return { u, s: r.status, loc: r.headers.get('location'), ct: r.headers.get('content-type'), ms: Date.now() - t, len: b.length, head: b.slice(0, 300) }; } catch (e) { return { u, err: String(e) }; } }));
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out, null, 1));
};
