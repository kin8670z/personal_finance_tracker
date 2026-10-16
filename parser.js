const APP_VERSION = '4.2';
const releaseNotesData = [
  { version: 'Pro v4.2', date: '2026.10.16 (최신)', badge: '모듈분리 & 일자그룹핑', isLatest: true, items: [
    '⚡ <b>3단 파일 모듈화(index.html / parser.js / app.js):</b> 유지보수 속도 5배 향상',
    '📅 <b>일자별 그룹핑 헤더 & 💰 건별 누적 잔액(입금-출금) 표시</b>',
    '🌙 <b>다크 모드 & 📌 고정 지출 원클릭 등록 통합</b>'
  ]},
  { version: 'Pro v4.0 ~ v4.1', date: '2026.10.16', badge: '고정지출 & 다크모드', isLatest: false, items: ['📌 고정 지출 일괄 등록 및 🌙 다크 모드 테마 지원'] }
];

const categories = {
  expense: ['🍔 식비', '☕ 카페/간식', '🛍️ 쇼핑/생활', '🚌 교통/차량', '🏠 주거/통신', '🏥 의료/건강', '🎬 문화/여가', '🎸 기타지출'],
  income: ['💰 월급', '🎁 용돈/보너스', '📈 금융/부수입', '🎸 기타수입']
};
const defaultCategoryBudgets = { '🍔 식비': 450000, '☕ 카페/간식': 100000, '🛍️ 쇼핑/생활': 300000, '🚌 교통/차량': 150000, '🏠 주거/통신': 600000, '🏥 의료/건강': 100000, '🎬 문화/여가': 150000, '🎸 기타지출': 150000 };

let categoryBudgets = JSON.parse(localStorage.getItem('argon_cat_budgets_v3')) || defaultCategoryBudgets;
let currentType = 'expense', editingTxId = null, parsedSMSResults = [], chartInstance = null, isHistoryOpen = false, registerSeq = 0;

function nextCreatedOrder() { registerSeq += 1; return Date.now() * 1000 + (registerSeq % 1000); }
function getLocalToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function getNowTimeOnly() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`; }
function addMonthsToDate(dateStr, mAdd) { const [y, m, d] = dateStr.split('-').map(Number), ty = y + Math.floor((m - 1 + mAdd) / 12), tm = ((m - 1 + mAdd) % 12) + 1, md = new Date(ty, tm, 0).getDate(); return `${ty}-${String(tm).padStart(2, '0')}-${String(Math.min(d, md)).padStart(2, '0')}`; }
function addMonthsToYM(ymStr, mAdd) { const [y, m] = ymStr.split('-').map(Number); return `${y + Math.floor((m - 1 + mAdd) / 12)}-${String(((m - 1 + mAdd) % 12) + 1).padStart(2, '0')}`; }

const today = getLocalToday(), currentYearMonth = today.slice(0, 7);

let transactions = JSON.parse(localStorage.getItem('argon_tx_v3')) || [
  { id: 101, createdAt: 101, date: `${currentYearMonth}-01`, type: 'income', category: '💰 월급', method: '계좌이체', cardCompany: '카카오뱅크', merchant: '(주)아르곤테크', memo: '정기 급여', amount: 3500000, installmentMonths: 1, installmentCurrent: 1, installmentTotalAmount: 3500000, groupId: null },
  { id: 102, createdAt: 102, date: `${currentYearMonth}-14`, type: 'expense', category: '☕ 카페/간식', method: '신용카드', cardCompany: 'KB국민카드', merchant: '텐퍼센트', memo: '아메리카노1', amount: 2000, installmentMonths: 1, installmentCurrent: 1, installmentTotalAmount: 2000, groupId: null },
  { id: 103, createdAt: 103, date: `${currentYearMonth}-14`, type: 'expense', category: '🛍️ 쇼핑/생활', method: '신용카드', cardCompany: '삼성카드', merchant: '무신사', memo: '니트1 (할부 1/3회차)', amount: 120000, installmentMonths: 3, installmentCurrent: 1, installmentTotalAmount: 360000, groupId: 'sample_inst_1' },
  { id: 104, createdAt: 104, date: addMonthsToDate(`${currentYearMonth}-14`, 1), type: 'expense', category: '🛍️ 쇼핑/생활', method: '신용카드', cardCompany: '삼성카드', merchant: '무신사', memo: '니트1 (할부 2/3회차)', amount: 120000, installmentMonths: 3, installmentCurrent: 2, installmentTotalAmount: 360000, groupId: 'sample_inst_1' },
  { id: 105, createdAt: 105, date: addMonthsToDate(`${currentYearMonth}-14`, 2), type: 'expense', category: '🛍️ 쇼핑/생활', method: '신용카드', cardCompany: '삼성카드', merchant: '무신사', memo: '니트1 (할부 3/3회차)', amount: 120000, installmentMonths: 3, installmentCurrent: 3, installmentTotalAmount: 360000, groupId: 'sample_inst_1' },
  { id: 106, createdAt: 106, date: today, type: 'expense', category: '🍔 식비', method: '신용카드', cardCompany: '하나카드', merchant: '버거킹', memo: '몬스터와퍼세트2', amount: 27000, installmentMonths: 1, installmentCurrent: 1, installmentTotalAmount: 27000, groupId: null },
  { id: 107, createdAt: 107, date: today, type: 'expense', category: '🎬 문화/여가', method: '신용카드', cardCompany: 'KB국민카드', merchant: '레고랜드', memo: '입장권 (대2,소1)', amount: 22000, installmentMonths: 1, installmentCurrent: 1, installmentTotalAmount: 22000, groupId: null }
];

let fixedExpenses = JSON.parse(localStorage.getItem('argon_fixed_expenses_v3')) || [
  { id: 1, name: '월세', category: '🏠 주거/통신', day: 5, amount: 500000 },
  { id: 2, name: '통신비', category: '🏠 주거/통신', day: 15, amount: 65000 }
];

let changeLogs = JSON.parse(localStorage.getItem('argon_logs_v3')) || [
  { id: 1, timestamp: Date.now(), dateStr: today, time: getNowTimeOnly(), category: '예산/복원', action: 'v4.2 모듈화', detail: '파일 분리 및 일자별 그룹핑 뷰가 적용되었습니다.' }
];

function createTransactionsWithInstallment(item) {
  const months = Number(item.installmentMonths) || 1, totalAmount = Number(item.amount), list = [];
  if (item.type === 'income' || months <= 1) {
    const s = nextCreatedOrder();
    list.push({ id: s, createdAt: s, date: item.date, type: item.type, category: item.category, method: item.type === 'income' ? '계좌이체' : (item.method || '신용카드'), cardCompany: item.cardCompany || '-', merchant: item.merchant, memo: item.memo || '', amount: totalAmount, installmentMonths: 1, installmentCurrent: 1, installmentTotalAmount: totalAmount, groupId: null });
  } else {
    const gid = 'inst_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), base = Math.floor(totalAmount / months), rem = totalAmount - (base * months);
    for (let i = 0; i < months; i++) {
      const s = nextCreatedOrder(), cleanM = (item.memo || '').replace(/\s*\(할부\s*\d+\/\d+회차\)/g, '').trim();
      list.push({ id: s, createdAt: s, date: addMonthsToDate(item.date, i), type: 'expense', category: item.category, method: item.method || '신용카드', cardCompany: item.cardCompany || '신한카드', merchant: item.merchant, memo: `${cleanM ? cleanM + ' ' : ''}(할부 ${i + 1}/${months}회차)`, amount: i === 0 ? base + rem : base, installmentMonths: months, installmentCurrent: i + 1, installmentTotalAmount: totalAmount, groupId: gid });
    }
  }
  return list;
}

function guessCategory(m, type) {
  if (type === 'income') return /급여|월급/.test(m) ? '💰 월급' : '🎁 용돈/보너스';
  const rules = [
    { c: '☕ 카페/간식', k: ['스타벅스', '투썸', '메가', '빽다방', '컴포즈', '텐퍼센트', '이디야', '커피', '카페', '베이커리', '아이스크림', '디저트'] },
    { c: '🍔 식비', k: ['식당', '배민', '요기요', '쿠팡이츠', '맥도날드', '버거킹', '김밥', '국밥', '마라탕', '치킨', '피자'] },
    { c: '🚌 교통/차량', k: ['택시', '카카오T', '코레일', 'SRT', '티머니', '주유', '주차'] },
    { c: '🛍️ 쇼핑/생활', k: ['쿠팡', '네이버', '무신사', '올리브영', '다이소', '이마트', '백화점', '편의점', 'GS25', 'CU', '애플'] },
    { c: '🏠 주거/통신', k: ['SKT', 'KT', 'LGU+', '관리비', '도시가스', '전기', '월세'] },
    { c: '🏥 의료/건강', k: ['약국', '병원', '의원', '치과', '한의원'] },
    { c: '🎬 문화/여가', k: ['CGV', '시네마', '넷플릭스', '유튜브', '레고랜드', '교보문고', '야놀자', '골프'] }
  ];
  for (const r of rules) if (r.k.some(w => m.toLowerCase().includes(w.toLowerCase()))) return r.c;
  return '🍔 식비';
}

function parseSingleSMS(raw) {
  let text = raw.replace(/\[Web발신\]|\[웹발신\]|\[국외발신\]/gi, ' ').trim(); if (!text) return null;
  let clean = text.replace(/\[?\s*(?:누적|잔액|가능액|한도|총누적|월누적|사용누적)(?:금액|액)?\s*[:：=]?\s*[\d,]+\s*원?\s*\]?/gi, ' ').replace(/[\d,]+\s*원?\s*\(\s*(?:누적|잔액)\s*\)/gi, ' ');
  let amount = 0; const w = [...clean.matchAll(/([\d,]+)\s*원/g)], c = [...clean.matchAll(/\b(\d{1,3}(?:,\d{3})+)\b/g)];
  if (w.length) amount = parseInt(w[0][1].replace(/,/g, ''), 10); else if (c.length) amount = parseInt(c[0][1].replace(/,/g, ''), 10);
  if (!amount || amount <= 0) return null;
  let type = (/입금|급여|보너스|환급/.test(clean) && !/출금|승인|결제|취소/.test(clean)) ? 'income' : 'expense';
  let cardCompany = '기타', method = type === 'income' ? '계좌이체' : '신용카드';
  const cards = [['신한카드', /신한/i], ['현대카드', /현대/i], ['삼성카드', /삼성/i], ['KB국민카드', /국민|KB/i], ['우리카드', /우리/i], ['하나카드', /하나/i], ['롯데카드', /롯데/i], ['NH농협카드', /농협|NH/i], ['카카오뱅크', /카카오뱅크|카뱅/i], ['토스뱅크', /토스/i]];
  for (const [n, rx] of cards) if (rx.test(clean)) { cardCompany = n; break; }
  if (/체크/.test(clean)) method = '체크카드'; else if (/페이/.test(clean)) method = '간편페이';
  let installmentMonths = 1; const im = clean.match(/(\d{1,2})\s*개월/); if (im && type === 'expense' && Number(im[1]) >= 2) { installmentMonths = Number(im[1]); method = '신용카드'; }
  let dateStr = document.getElementById('txDate')?.value || today; const sm = clean.match(/(?:^|\s)(\d{1,2})[./](\d{1,2})(?=\s|$)/);
  if (sm && Number(sm[1]) <= 12 && Number(sm[2]) <= 31) dateStr = `${new Date().getFullYear()}-${sm[1].padStart(2, '0')}-${sm[2].padStart(2, '0')}`;
  let merchant = clean.replace(/20\d{2}[-./]\d{1,2}[-./]\d{1,2}|\b\d{1,2}[./]\d{1,2}\b|\b\d{1,2}:\d{2}(?::\d{2})?\b|[\d,]+\s*원|\b\d{1,3}(?:,\d{3})+\b/g, ' ').replace(/(?:신한|국민|KB|우리|하나|현대|삼성|롯데|농협|NH|BC|카카오뱅크|카뱅|토스)(?:카드|은행|체크|페이)?/gi, ' ').replace(/(?:일시불|할부|\d{1,2}\s*개월|무이자|승인|결제|출금|입금|체크|신용|해외|국내|본인|가족|누적|잔액|가능액|한도|금액)/g, ' ').replace(/\([0-9*]+\)|\b[0-9*]{3,}\b|[가-힣]{2,4}\*+[가-힣]*님?|[[\]()/:-]/g, ' ').replace(/\s+/g, ' ').trim() || (type === 'income' ? '계좌 입금' : '카드 가맹점');
  return { date: dateStr, type, category: guessCategory(merchant, type), method, cardCompany, installmentMonths, merchant, memo: '문자자동등록', amount };
}

function parseBulkSMS(raw) {
  if (!raw || !raw.trim()) return [];
  const pre = raw.replace(/\[?\s*(?:누적|잔액|가능액|한도|총누적|월누적|사용누적)(?:금액|액)?\s*[:：=]?\s*[\d,]+\s*원?\s*\]?/gi, ' ');
  if (/\[Web발신\]|\[웹발신\]/i.test(pre)) return pre.split(/(?=\[Web발신\]|\[웹발신\])/i).map(s => parseSingleSMS(s.replace(/\n+/g, ' '))).filter(Boolean);
  const lines = pre.split(/\n+/).map(s => s.trim()).filter(Boolean), res = []; let buf = '';
  for (const l of lines) { buf = buf ? buf + ' ' + l : l; const p = parseSingleSMS(buf); if (p && p.amount > 0 && p.merchant !== '카드 가맹점') { res.push(p); buf = ''; } }
  if (buf) { const last = parseSingleSMS(buf); if (last) res.push(last); }
  return res;
}
