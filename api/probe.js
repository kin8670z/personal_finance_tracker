// 임시: 해외 종목 데이터 확인 (머지 전 삭제)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const H = { 'User-Agent': UA, Referer: 'https://m.stock.naver.com/' };
const URLS = [
  'https://ac.stock.naver.com/ac?q=%EC%95%A0%ED%94%8C&target=stock',
  'https://ac.stock.naver.com/ac?q=nvda&target=stock',
  'https://ac.stock.naver.com/ac?q=%EB%B2%84%ED%81%AC%EC%85%94&target=stock',
  'https://polling.finance.naver.com/api/realtime/worldstock/stock/AAPL.O,NVDA.O,KO',
  'https://api.stock.naver.com/chart/foreign/item/AAPL.O?periodType=dayCandle',
  'https://api.stock.naver.com/chart/foreign/item/AAPL.O?periodType=minute',
  'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=5m',
  'https://query1.finance.yahoo.com/v8/finance/chart/BRK-B?range=1d&interval=5m'
];
module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  if (q.has('i')) { const r = await fetch(URLS[+q.get('i')], { headers: H }); res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end(await r.text()); }
  const out = await Promise.all(URLS.map(async u => { try { const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(7000) }); const b = await r.text(); return { u, s: r.status, len: b.length, head: b.slice(0, 500) }; } catch (e) { return { u, err: String(e) }; } }));
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
};
