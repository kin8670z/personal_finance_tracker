// 주식 현황 페이지용 공개 시세 프록시 (Vercel 서버 함수)
// 브라우저에서 바로 부르면 CORS에 막히는 네이버 증권·야후 파이낸스 공개 시세를 대신 받아서
// 필요한 값만 정리해 돌려준다. 계좌·키 같은 개인 정보는 전혀 쓰지 않는다.
//   /api/stock?op=quotes&kr=005930,000660&us=AAPL.O,NVDA.O&idx=KOSPI,KOSDAQ&world=.DJI,.IXIC&fx=1&spark=1
//   /api/stock?op=chart&kind=kr|us|idx|world|fx&code=005930&range=1d|1m|3m|1y|3y
//   /api/stock?op=search&q=카카오
//   /api/stock?op=div&kr=005930&us=AAPL.O   → 최근 3년 배당 기록 (배당락일, 주당 배당금) — 야후 파이낸스

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const NAVER = { 'User-Agent': UA, Referer: 'https://m.stock.naver.com/' };

// 네이버 해외 지수 코드 → 야후 심볼 (해외 지수 그래프는 야후에서)
const WORLD = { '.DJI': '^DJI', '.IXIC': '^IXIC', '.INX': '^GSPC', '.SOX': '^SOX', '.N225': '^N225', '.SSEC': '000001.SS', '.HSI': '^HSI' };
const INDEX = ['KOSPI', 'KOSDAQ', 'KPI200'];
const CODE_RE = /^[0-9A-Z]{6}$/;
// 미국 종목: 네이버 로이터 코드 (AAPL.O, KO, BRKb …)
const US_RE = /^[A-Za-z0-9]{1,10}(\.[A-Z]{1,2})?$/;
// 로이터 코드 → 야후 심볼: AAPL.O → AAPL, BRKb → BRK-B
function yahooOf(code) { const m = /^([A-Z0-9]+?)([a-z])?(\.[A-Z]+)?$/.exec(code); return m ? m[1] + (m[2] ? '-' + m[2].toUpperCase() : '') : code; }

async function get(url, headers = NAVER, type = 'json') {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return type === 'json' ? r.json() : r.text();
}
const num = v => (v === null || v === undefined || v === '' || v === '-') ? null : Number(String(v).replace(/,/g, ''));
const list = (v, ok, max = 30) => String(v || '').split(',').map(s => s.trim().toUpperCase()).filter(ok).slice(0, max);

// KST 기준 날짜 문자열
function kst(d = new Date()) { return new Date(d.getTime() + 9 * 3600e3); }
function ymd(d) { const k = kst(d); return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, '0')}${String(k.getUTCDate()).padStart(2, '0')}`; }
// "20261120090000" / "20261120" (KST) → epoch ms
function ts(s) {
  const y = +s.slice(0, 4), m = +s.slice(4, 6) - 1, d = +s.slice(6, 8), h = s.length > 8 ? +s.slice(8, 10) : 0, mi = s.length > 8 ? +s.slice(10, 12) : 0;
  return Date.UTC(y, m, d, h - 9, mi);
}
// 차트 포인트 수 줄이기 (마지막 값은 항상 유지)
function thin(points, max) {
  if (points.length <= max) return points;
  const step = points.length / max, out = [];
  for (let i = 0; i < max - 1; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

function dirOf(change) { return change > 0 ? 'up' : change < 0 ? 'down' : 'flat'; }
function fromPolling(d, id, name) {
  const price = num(d.closePriceRaw ?? d.closePrice), change = num(d.compareToPreviousClosePriceRaw ?? d.compareToPreviousClosePrice);
  return {
    id, name, price, change, rate: num(d.fluctuationsRatioRaw ?? d.fluctuationsRatio), dir: dirOf(change),
    open: num(d.openPriceRaw ?? d.openPrice), high: num(d.highPriceRaw ?? d.highPrice), low: num(d.lowPriceRaw ?? d.lowPrice),
    volume: num(d.accumulatedTradingVolumeRaw), value: d.accumulatedTradingValue || null,
    market: d.stockExchangeType ? d.stockExchangeType.nameKor || d.stockExchangeType.code : null,
    status: d.marketStatus || null, time: d.localTradedAt || null
  };
}

// ---------- 시세 ----------
async function krQuotes(codes) {
  if (!codes.length) return [];
  const j = await get(`https://polling.finance.naver.com/api/realtime/domestic/stock/${codes.join(',')}`);
  return (j.datas || []).map(d => fromPolling(d, d.itemCode, d.stockName));
}
async function idxQuotes(codes) {
  if (!codes.length) return [];
  const j = await get(`https://polling.finance.naver.com/api/realtime/domestic/index/${codes.join(',')}`);
  return (j.datas || []).map(d => fromPolling(d, d.itemCode, d.stockName));
}
async function worldQuotes(codes) {
  if (!codes.length) return [];
  const j = await get(`https://polling.finance.naver.com/api/realtime/worldstock/index/${codes.join(',')}`);
  return (j.datas || []).map(d => fromPolling(d, d.reutersCode, d.indexName));
}
async function usQuotes(codes) {
  if (!codes.length) return [];
  const j = await get(`https://polling.finance.naver.com/api/realtime/worldstock/stock/${codes.map(encodeURIComponent).join(',')}`);
  return (j.datas || []).map(d => ({ ...fromPolling(d, d.reutersCode, d.stockName), currency: 'USD', symbol: d.symbolCode || null }));
}
// 환율 계산기용 통화 (unit: 원화 표시 기준 수량 — 100엔, 100동 …)
const FXS = { USD: ['미국 달러', 1], JPY: ['일본 엔', 100], EUR: ['유로', 1], CNY: ['중국 위안', 1], GBP: ['영국 파운드', 1], HKD: ['홍콩 달러', 1], TWD: ['대만 달러', 1], THB: ['태국 바트', 1], VND: ['베트남 동', 100], PHP: ['필리핀 페소', 1], SGD: ['싱가포르 달러', 1], AUD: ['호주 달러', 1] };
async function fxOne(c) {
  const unit = FXS[c][1];
  // 1순위 야후 (1단위 기준 → unit 곱하기), 실패하면 네이버
  try {
    const y = await yahoo(`${c}KRW=X`, '1d'), last = y.points.length && y.points[y.points.length - 1][1];
    if (last) { const price = last * unit, prev = y.prevClose ? y.prevClose * unit : null, change = prev ? price - prev : 0; return { id: c, name: FXS[c][0], unit, price, change, rate: prev ? change / prev * 100 : 0, dir: dirOf(change), src: 'yahoo' }; }
  } catch (e) { /* 네이버로 */ }
  const j = await get(`https://m.stock.naver.com/front-api/marketIndex/productDetail?category=exchange&reutersCode=FX_${c}KRW`);
  const r = j.result || {}, t = r.fluctuationsType && r.fluctuationsType.name, sign = t === 'FALLING' ? -1 : t === 'RISING' ? 1 : 0;
  const change = sign * Math.abs(num(r.fluctuations) || 0);
  return { id: c, name: FXS[c][0], unit, price: num(r.closePrice), change, rate: sign * Math.abs(num(r.fluctuationsRatio) || 0), dir: dirOf(change), src: 'naver' };
}
async function fxQuote() {
  const j = await get('https://m.stock.naver.com/front-api/marketIndex/productDetail?category=exchange&reutersCode=FX_USDKRW');
  const r = j.result || {}, t = r.fluctuationsType && r.fluctuationsType.name;
  const sign = t === 'FALLING' ? -1 : t === 'RISING' ? 1 : 0;
  const change = sign * Math.abs(num(r.fluctuations) || 0), rate = sign * Math.abs(num(r.fluctuationsRatio) || 0);
  return [{ id: 'USD', name: '원/달러', price: num(r.closePrice), change, rate, dir: dirOf(change), status: r.marketStatus || null, time: r.localTradedAt || null }];
}

// ---------- 차트 ----------
async function naverDaily(kind, code, from, unit = 'day') {
  const path = kind === 'idx' ? 'index' : 'item';
  const j = await get(`https://api.stock.naver.com/chart/domestic/${path}/${code}/${unit}?startDateTime=${from}0000&endDateTime=${ymd()}2359`);
  return (Array.isArray(j) ? j : []).map(p => [ts(p.localDate), p.closePrice, p.highPrice, p.lowPrice, p.openPrice, p.accumulatedTradingVolume]).filter(p => p[1] != null);
}
async function naverIntraday(kind, code) {
  const path = kind === 'idx' ? 'index' : 'item';
  let j = await get(`https://api.stock.naver.com/chart/domestic/${path}/${code}/minute`);
  if (!Array.isArray(j) || !j.length) {
    // 장 시작 전·주말: 가장 최근 거래일의 분봉
    const days = await naverDaily(kind, code, ymd(new Date(Date.now() - 14 * 864e5)));
    if (!days.length) return [];
    const last = ymd(new Date(days[days.length - 1][0]));
    j = await get(`https://api.stock.naver.com/chart/domestic/${path}/${code}/minute?startDateTime=${last}0800&endDateTime=${last}2000`);
  }
  return (Array.isArray(j) ? j : []).map(p => [ts(p.localDateTime), p.currentPrice, p.highPrice, p.lowPrice, p.openPrice]).filter(p => p[1] != null);
}
const YRANGE = { '1d': ['1d', '5m'], '1m': ['1mo', '1d'], '3m': ['3mo', '1d'], '1y': ['1y', '1d'], '3y': ['5y', '1wk'] };
async function yahoo(symbol, range) {
  const [r, i] = YRANGE[range];
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${r}&interval=${i}`, { 'User-Agent': UA });
  const res = j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.timestamp) return { points: [], prevClose: null };
  const qt = res.indicators.quote[0];
  let points = res.timestamp.map((t, k) => [t * 1000, qt.close[k], qt.high && qt.high[k], qt.low && qt.low[k], qt.open && qt.open[k], qt.volume && qt.volume[k]]).filter(p => p[1] != null);
  if (range === '3y') { const cut = Date.now() - 3 * 365 * 864e5; points = points.filter(p => p[0] >= cut); }
  return { points, prevClose: res.meta ? (res.meta.chartPreviousClose ?? res.meta.previousClose ?? null) : null };
}
// 배당 기록: 야후 chart API의 events=div (국내는 코스피 .KS, 아니면 코스닥 .KQ)
async function dividends(symbols) {
  for (const s of symbols) {
    try {
      const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=3y&interval=1mo&events=div`, { 'User-Agent': UA });
      const res = j.chart && j.chart.result && j.chart.result[0];
      if (!res || !res.meta) continue;
      const ev = Object.values((res.events && res.events.dividends) || {}).map(d => [d.date * 1000, d.amount]).filter(d => d[1] > 0).sort((a, b) => a[0] - b[0]);
      return { sym: s, cur: res.meta.currency || null, events: ev };
    } catch (e) { /* 다음 후보 */ }
  }
  return null;
}
const FROM = { '1m': 31, '3m': 92, '1y': 366, '3y': 3 * 366 };
async function chart(kind, code, range) {
  if (kind === 'world') return yahoo(WORLD[code], range);
  if (kind === 'us') return yahoo(yahooOf(code), range);
  if (kind === 'fx') return yahoo('KRW=X', range);
  if (range === '1d') return { points: await naverIntraday(kind, code), prevClose: null };
  const from = ymd(new Date(Date.now() - FROM[range] * 864e5));
  let points;
  if (range === '3y') { try { points = await naverDaily(kind, code, from, 'week'); } catch (e) { points = null; } }
  if (!points || !points.length) points = await naverDaily(kind, code, from);
  return { points, prevClose: null };
}

// 기간 통계: 시작가, 최고가·최저가(와 그 날짜), 평균 거래량
function stats(points) {
  if (!points.length) return null;
  const v = (p, i) => (p[i] == null || isNaN(p[i]) ? p[1] : p[i]);
  let hi = points[0], lo = points[0], volSum = 0, volN = 0;
  for (const p of points) {
    if (v(p, 2) > v(hi, 2)) hi = p;
    if (v(p, 3) < v(lo, 3)) lo = p;
    if (p[5] != null && !isNaN(p[5])) { volSum += p[5]; volN++; }
  }
  return { open: v(points[0], 4), high: v(hi, 2), highAt: hi[0], low: v(lo, 3), lowAt: lo[0], close: points[points.length - 1][1], avgVolume: volN ? Math.round(volSum / volN) : null };
}

// ---------- 검색 ----------
async function search(q) {
  const j = await get(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`);
  return (j.items || []).filter(it => (it.nationCode === 'KOR' && CODE_RE.test(String(it.code))) || (it.nationCode === 'USA' && US_RE.test(String(it.reutersCode || ''))))
    .slice(0, 10).map(it => it.nationCode === 'USA'
      ? { code: it.reutersCode, name: it.name, market: it.typeName || it.typeCode || '', nation: 'USA', ticker: it.code }
      : { code: it.code, name: it.name, market: it.typeName || it.typeCode || '', nation: 'KOR' });
}

function send(res, status, body, maxAge) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', status === 200 ? `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}` : 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://localhost').searchParams;
  const op = q.get('op');
  try {
    if (op === 'quotes') {
      const kr = list(q.get('kr'), c => CODE_RE.test(c)), idx = list(q.get('idx'), c => INDEX.includes(c));
      const world = String(q.get('world') || '').split(',').map(s => s.trim()).filter(c => WORLD[c]).slice(0, 10);
      const us = String(q.get('us') || '').split(',').map(s => s.trim()).filter(c => US_RE.test(c)).slice(0, 30);
      const wantFx = q.get('fx') === '1', wantSpark = q.get('spark') === '1';
      const settle = p => p.then(v => v, e => { console.error(e.message); return null; });
      const [a, b, c, d, e] = await Promise.all([settle(krQuotes(kr)), settle(idxQuotes(idx)), settle(worldQuotes(world)), wantFx ? settle(fxQuote()) : [], settle(usQuotes(us))]);
      const out = { kr: a, idx: b, world: c, fx: d, us: e, at: new Date().toISOString() };
      if (wantSpark) {
        const jobs = [
          ...kr.map(code => ['kr', code]), ...us.map(code => ['us', code]), ...idx.map(code => ['idx', code]),
          ...world.map(code => ['world', code]), ...(wantFx ? [['fx', 'USD']] : [])
        ];
        const sp = await Promise.all(jobs.map(([k, code]) => settle(chart(k, code, '1d'))));
        out.spark = {};
        jobs.forEach(([k, code], i) => { if (sp[i]) out.spark[`${k}:${code}`] = { p: thin(sp[i].points, 80).map(p => p[1]), prev: sp[i].prevClose }; });
      }
      if (!a && !b && !c && !e && !(d && d.length)) return send(res, 502, { error: '시세를 불러오지 못했어요' });
      return send(res, 200, out, 20);
    }
    if (op === 'chart') {
      const kind = q.get('kind'), range = q.get('range') || '1d';
      let code = String(q.get('code') || '');
      if (kind !== 'world' && kind !== 'us') code = code.toUpperCase();
      const valid = (kind === 'us' && US_RE.test(code)) || (kind === 'kr' && CODE_RE.test(code)) || (kind === 'idx' && INDEX.includes(code)) || (kind === 'world' && WORLD[code]) || (kind === 'fx' && code === 'USD');
      if (!valid || !YRANGE[range]) return send(res, 400, { error: '잘못된 요청' });
      const r = await chart(kind, code, range);
      return send(res, 200, { points: thin(r.points, range === '1d' ? 400 : 260).map(p => [p[0], p[1]]), prevClose: r.prevClose, stats: stats(r.points) }, range === '1d' ? 60 : 1800);
    }
    if (op === 'fx') {
      const codes = String(q.get('c') || Object.keys(FXS).join(',')).split(',').map(x => x.trim().toUpperCase()).filter(x => FXS[x]).slice(0, 12);
      const got = await Promise.all(codes.map(c => fxOne(c).catch(e => { console.error(e.message); return null; })));
      const items = got.filter(x => x && x.price);
      if (!items.length) return send(res, 502, { error: '환율을 불러오지 못했어요' });
      return send(res, 200, { items, at: new Date().toISOString() }, 300);
    }
    if (op === 'div') {
      const kr = list(q.get('kr'), c => CODE_RE.test(c), 20);
      const us = String(q.get('us') || '').split(',').map(s => s.trim()).filter(c => US_RE.test(c)).slice(0, 20);
      const jobs = [...kr.map(c => [`KRX:${c}`, [`${c}.KS`, `${c}.KQ`]]), ...us.map(c => [`US:${c}`, [yahooOf(c)]])];
      const got = await Promise.all(jobs.map(([, syms]) => dividends(syms).catch(() => null)));
      const div = {}; jobs.forEach(([k], i) => { if (got[i]) div[k] = got[i]; });
      return send(res, 200, { div }, 43200);
    }
    if (op === 'probe') {   // 임시: 네이버 순위 엔드포인트 확인용
      const U = [
        'https://m.stock.naver.com/api/stocks/up/KOSPI?page=1&pageSize=3',
        'https://m.stock.naver.com/api/stocks/down/KOSDAQ?page=1&pageSize=3',
        'https://m.stock.naver.com/api/stocks/marketValue/KOSPI?page=1&pageSize=3',
        'https://m.stock.naver.com/api/stocks/quantTop/KOSPI?page=1&pageSize=3',
        'https://m.stock.naver.com/api/stocks/priceTop/KOSPI?page=1&pageSize=3',
        'https://m.stock.naver.com/api/stocks/searchTop?page=1&pageSize=3',
        'https://m.stock.naver.com/api/stocks/popular?page=1&pageSize=3',
        'https://api.stock.naver.com/stock/exchange/NASDAQ/marketValue?page=1&pageSize=3',
        'https://api.stock.naver.com/stock/exchange/NASDAQ/up?page=1&pageSize=3',
        'https://m.stock.naver.com/api/index/KOSPI/basic',
        'https://m.stock.naver.com/api/index/KOSPI/trend',
        'https://m.stock.naver.com/api/index/KOSPI/investor',
        'https://m.stock.naver.com/api/stocks/industry?page=1&pageSize=3',
        'https://m.stock.naver.com/front-api/stock/domestic/ranking?type=SEARCH&page=1&pageSize=3'
      ];
      const out = await Promise.all(U.map(async u => { try { const r = await fetch(u, { headers: NAVER, signal: AbortSignal.timeout(6000) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} const first = j ? (Array.isArray(j) ? j[0] : (j.stocks || j.result || j.datas || j)[0] || j.stocks || j) : t.slice(0, 120); return { u: u.replace(/https:\/\/[^/]+/, ''), s: r.status, keys: j && !Array.isArray(j) ? Object.keys(j).slice(0, 20) : null, first: JSON.stringify(first).slice(0, 600) }; } catch (e) { return { u, err: e.message }; } }));
      return send(res, 200, out, 0);
    }
    if (op === 'search') {
      const term = String(q.get('q') || '').trim().slice(0, 30);
      if (!term) return send(res, 400, { error: '검색어가 없어요' });
      return send(res, 200, { items: await search(term) }, 86400);
    }
    return send(res, 400, { error: '알 수 없는 요청' });
  } catch (e) {
    console.error(e);
    return send(res, 502, { error: '데이터를 불러오지 못했어요' });
  }
};
