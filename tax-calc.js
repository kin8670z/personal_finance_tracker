// 아르곤 자산관리: 신용카드 등 소득공제 미리보기 계산 (2026년 귀속 기준, 연말정산 화면·오늘 화면이 같이 씀)
// 가계부 기록(argon_tx_v3)으로 대략 계산한다. 실제 금액은 홈택스 간소화 자료로 확인해야 한다.
(function () {
  const TAX_KEY = 'argon_tax_v1';
  const YEAR = 2026;
  const DEFAULT = { salary: 0, kids: 0, pay: 'credit', cash: true, exclude: ['🏠 주거/통신'], extraCredit: 0, extraDebit: 0 };

  // 2026년 귀속: 신용 15% · 체크/현금영수증 30% · 도서공연 등 30%(총급여 7천 이하) · 전통시장 40% · 대중교통 40%
  const RATE = { credit: 0.15, debit: 0.30, culture: 0.30, market: 0.40, transit: 0.40 };
  const ORDER = ['credit', 'debit', 'culture', 'market', 'transit'];   // 최저사용금액(총급여 25%)은 공제율 낮은 것부터 채운다
  const LABEL = { credit: '💳 신용카드', debit: '🏧 체크·현금영수증', culture: '📚 도서·공연·체육', market: '🧺 전통시장', transit: '🚇 대중교통', none: '🚫 공제 안 됨' };

  const TRANSIT = /지하철|버스|교통|티머니|t-?money|캐시비|cashbee|코레일|korail|ktx|srt|철도|레일|메트로|metro/i;
  const CULTURE = /서점|문고|교보|영풍|yes24|예스24|알라딘|도서|북스|책방|밀리의서재|리디|영화|cgv|메가박스|롯데시네마|씨네|공연|뮤지컬|연극|티켓|인터파크|박물관|미술관|전시|수영|헬스|피트니스|체육관|신문/i;
  const MARKET = /전통시장|재래시장/;
  const NEVER = /보험|국세|지방세|세금|과태료|관리비|상품권|기프트카드|통신요금|휴대폰요금|아파트/;

  function loadSettings() {
    try { return Object.assign({}, DEFAULT, JSON.parse(localStorage.getItem(TAX_KEY)) || {}); } catch (e) { return Object.assign({}, DEFAULT); }
  }
  function saveSettings(s) { try { localStorage.setItem(TAX_KEY, JSON.stringify(s)); } catch (e) {} }
  function loadTx() { try { return JSON.parse(localStorage.getItem('argon_tx_v3')) || []; } catch (e) { return []; } }

  const lowPay = s => !s.salary || s.salary <= 70000000;

  // 내역 하나 → 어느 공제 칸인지 ('none' = 공제 안 됨) + 금액
  function classify(t, s) {
    if (t.type !== 'expense') return null;
    // 할부는 산 달에 전체 금액으로 잡힌다 (1회차에만 총액)
    let amount = Number(t.amount) || 0;
    if ((t.installmentMonths || 1) > 1) { if ((t.installmentCurrent || 1) !== 1) return null; amount = Number(t.installmentTotalAmount) || amount * t.installmentMonths; }
    const m = t.method, text = `${t.merchant || ''} ${t.memo || ''}`;
    let pay = m === '신용카드' ? 'credit' : m === '체크카드' ? 'debit' : m === '간편페이' ? s.pay : m === '현금' ? (s.cash ? 'debit' : 'none') : 'none';
    let why = pay === 'none' ? (m === '현금' ? '현금영수증 안 받음' : `${m || '결제수단 없음'}은 공제 대상 아님`) : '';
    if (pay !== 'none' && (s.exclude || []).includes(t.category)) { pay = 'none'; why = '공제 제외 카테고리'; }
    if (pay !== 'none' && NEVER.test(text)) { pay = 'none'; why = '보험료·세금·상품권 등은 제외'; }
    let kind = pay;
    if (pay !== 'none') {
      if (MARKET.test(text)) kind = 'market';
      else if ((t.category || '').includes('교통') && TRANSIT.test(text) && !/택시|주유|주차|톨게이트|하이패스/.test(text)) kind = 'transit';
      else if (lowPay(s) && CULTURE.test(text)) kind = 'culture';
    }
    return { kind, amount, why };
  }

  function emptyBuckets() { return { credit: 0, debit: 0, culture: 0, market: 0, transit: 0, none: 0 }; }

  // 공제액 계산
  function deduction(b, s) {
    const salary = s.salary || 0, low = lowPay(s), kids = Math.min(2, Number(s.kids) || 0);
    const threshold = salary * 0.25;
    let rem = threshold; const ded = {};
    ORDER.forEach(k => { const amt = b[k] || 0, used = Math.min(rem, amt); rem -= used; ded[k] = (amt - used) * RATE[k]; });
    const total = ORDER.reduce((a, k) => a + ded[k], 0);
    const baseLimit = (low ? [300, 350, 400] : [250, 275, 300])[kids] * 10000;
    const extraLimit = (low ? 300 : 200) * 10000;
    const base = Math.min(total, baseLimit);
    const special = ded.culture + ded.market + ded.transit;
    const extra = Math.max(0, Math.min(total - base, special, extraLimit));
    const spent = ORDER.reduce((a, k) => a + (b[k] || 0), 0);
    return { threshold, spent, overThreshold: spent - threshold, total: Math.floor(base + extra), base, extra, baseLimit, extraLimit, raw: total, ded, capped: total > baseLimit };
  }

  // 과세표준을 대략 잡아서 한계세율 (지방소득세 10% 포함해서 곱함)
  function marginalRate(salary, ded) {
    if (!salary) return 0.15;
    const s = salary;
    const earned = s <= 5e6 ? s * 0.7 : s <= 15e6 ? 3.5e6 + (s - 5e6) * 0.4 : s <= 45e6 ? 7.5e6 + (s - 15e6) * 0.15 : s <= 1e8 ? 12e6 + (s - 45e6) * 0.05 : Math.min(20e6, 14.75e6 + (s - 1e8) * 0.02);
    const base = s - earned - 1.5e6 - s * 0.09 - (ded || 0);   // 본인 기본공제 150만, 4대보험 약 9%
    return base <= 14e6 ? 0.06 : base <= 50e6 ? 0.15 : base <= 88e6 ? 0.24 : base <= 150e6 ? 0.35 : base <= 300e6 ? 0.38 : base <= 500e6 ? 0.40 : base <= 1e9 ? 0.42 : 0.45;
  }

  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // 올해 지금까지 + 연말까지 예상 (지금까지 하루 평균으로 남은 날 채움)
  function analyze(s, txs, now) {
    s = s || loadSettings(); txs = txs || loadTx(); now = now || new Date();
    const today = ymd(now), y = String(YEAR);
    const sofar = emptyBuckets(), byMonth = {}, items = [];
    txs.forEach(t => {
      if (!t.date || !t.date.startsWith(y) || t.date > today) return;
      const c = classify(t, s); if (!c) return;
      sofar[c.kind] += c.amount;
      const mo = t.date.slice(5, 7); (byMonth[mo] = byMonth[mo] || emptyBuckets())[c.kind] += c.amount;
      items.push({ t, ...c });
    });
    sofar.credit += Number(s.extraCredit) || 0; sofar.debit += Number(s.extraDebit) || 0;
    const start = new Date(YEAR, 0, 1), end = new Date(YEAR, 11, 31);
    const inYear = now >= start && now <= new Date(YEAR, 11, 31, 23, 59, 59);
    const daysPassed = inYear ? Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 864e5) + 1 : 365;
    const daysLeft = inYear ? Math.round((end - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5) : 0;
    // 가계부를 쓰기 시작한 날부터의 평균 (올해 중간부터 썼으면 그때부터)
    const firstDate = items.map(i => i.t.date).sort()[0];
    const trackedDays = firstDate ? Math.max(1, Math.floor((new Date(today) - new Date(firstDate)) / 864e5) + 1) : daysPassed;
    const remain = emptyBuckets();
    ORDER.forEach(k => { remain[k] = Math.round((sofar[k] - (k === 'credit' ? Number(s.extraCredit) || 0 : k === 'debit' ? Number(s.extraDebit) || 0 : 0)) / trackedDays * daysLeft); });
    const proj = emptyBuckets(); ORDER.forEach(k => proj[k] = sofar[k] + remain[k]); proj.none = sofar.none;

    const now$ = deduction(sofar, s), end$ = deduction(proj, s);
    // 남은 기간 신용카드로 쓸 돈을 체크카드로 바꾸면?
    const swap = Object.assign({}, proj, { credit: sofar.credit, debit: proj.debit + remain.credit });
    const swap$ = deduction(swap, s);
    const rate = marginalRate(s.salary, end$.total) * 1.1;
    const remainSpend = ORDER.reduce((a, k) => a + remain[k], 0);
    let advice;
    if (!s.salary) advice = { kind: 'need', text: '총급여(연봉)를 넣으면 계산해요.' };
    else if (end$.spent < end$.threshold) advice = { kind: 'below', text: `연말까지 써도 총급여의 25%(${won(end$.threshold)})를 못 넘을 것 같아요. 넘는 부분부터 공제라, 지금은 결제수단보다 카드 혜택(할인·적립) 좋은 걸 쓰는 게 나아요.`, short: Math.round(end$.threshold - end$.spent) };
    else if (swap$.total - end$.total > 1000) advice = { kind: 'switch', text: `남은 기간엔 체크카드·현금영수증이 유리해요. 신용카드로 쓸 돈(약 ${won(remain.credit)})을 체크카드로 바꾸면 공제가 ${won(swap$.total - end$.total)} 늘어서 세금이 약 ${won((swap$.total - end$.total) * rate)} 줄어요.`, gain: Math.round((swap$.total - end$.total) * rate) };
    else if (end$.capped) advice = { kind: 'cap', text: `기본 한도(${won(end$.baseLimit)})를 채울 것 같아요. 결제수단을 바꿔도 공제는 그대로라 카드 혜택 좋은 걸 쓰면 돼요. 대중교통·전통시장·도서공연은 한도가 따로 ${won(end$.extraLimit)} 더 있어요.` };
    else advice = { kind: 'ok', text: '지금 쓰는 방식 그대로 괜찮아요.' };
    return { s, sofar, remain, proj, now: now$, end: end$, swap: swap$, rate, saveNow: Math.round(now$.total * rate), saveEnd: Math.round(end$.total * rate), advice, items, byMonth, daysLeft, remainSpend, year: YEAR };
  }

  function won(n) {
    n = Math.round(n || 0);
    const a = Math.abs(n);
    if (a >= 1e8) return (n / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, '') + '억원';
    if (a >= 1e4) return Math.round(n / 1e4).toLocaleString('ko-KR') + '만원';
    return n.toLocaleString('ko-KR') + '원';
  }

  window.ArgonTax = { TAX_KEY, YEAR, RATE, ORDER, LABEL, loadSettings, saveSettings, classify, deduction, marginalRate, analyze, won };
})();
