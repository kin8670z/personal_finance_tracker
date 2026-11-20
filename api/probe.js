// 임시: Vercel 서버에서 시세 소스 응답 확인용 (머지 전 삭제)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const URLS = [
  'https://polling.finance.naver.com/api/realtime/domestic/stock/005930,000660',
  'https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI,KOSDAQ',
  'https://polling.finance.naver.com/api/realtime/worldstock/index/.DJI,.IXIC',
  'https://m.stock.naver.com/api/stock/005930/basic',
  'https://m.stock.naver.com/api/index/KOSPI/basic',
  'https://api.stock.naver.com/index/.IXIC/basic',
  'https://api.stock.naver.com/chart/domestic/item/005930/day?startDateTime=202608200000&endDateTime=202611202359',
  'https://api.stock.naver.com/chart/domestic/item/005930/minute',
  'https://api.stock.naver.com/chart/domestic/index/KOSPI/minute',
  'https://api.stock.naver.com/chart/foreign/index/.IXIC/minute',
  'https://fchart.stock.naver.com/siseJson.nhn?symbol=005930&requestType=1&startTime=20261101&endTime=20261120&timeframe=day',
  'https://m.stock.naver.com/front-api/marketIndex/productDetail?category=exchange&reutersCode=FX_USDKRW',
  'https://query1.finance.yahoo.com/v8/finance/chart/005930.KS?range=1d&interval=5m',
  'https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?range=1d&interval=5m',
  'https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?range=1mo&interval=1d',
  'https://api.stock.naver.com/chart/foreign/index/.IXIC?periodType=dayCandle',
  'https://api.stock.naver.com/chart/domestic/item/005930/week?startDateTime=202311200000&endDateTime=202611202359',
  'https://polling.finance.naver.com/api/realtime/domestic/stock/247540',
  'https://polling.finance.naver.com/api/realtime/worldstock/index/.SOX,.N225,.SSEC,.HSI,.INX',
  'https://query1.finance.yahoo.com/v8/finance/chart/%5ESOX?range=1d&interval=5m',
  'https://ac.stock.naver.com/ac?q=%EC%B9%B4%EC%B9%B4%EC%98%A4&target=stock',
  'https://api.stock.naver.com/chart/domestic/index/KOSPI/day?startDateTime=202610200000&endDateTime=202611202359',
  'https://api.stock.naver.com/chart/domestic/item/005930/minute?startDateTime=202611190900&endDateTime=202611191530',
];
module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  if (q.has('i')) { const r = await fetch(URLS[+q.get('i')], { headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/' } }); res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end(await r.text()); }
  const out = await Promise.all(URLS.map(async u => {
    const t = Date.now();
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/' }, signal: AbortSignal.timeout(6000) });
      const body = await r.text();
      return { u, status: r.status, ms: Date.now() - t, len: body.length, head: body.slice(0, 700) };
    } catch (e) { return { u, err: String(e), ms: Date.now() - t }; }
  }));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(out, null, 1));
};
