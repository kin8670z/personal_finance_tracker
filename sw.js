try { importScripts('./market-events.js'); } catch (e) {}
// 든든 서비스 워커: 홈 화면 앱 설치 + 오프라인일 때 마지막 화면 보여주기
// 항상 네트워크를 먼저 쓰고(최신 버전 유지), 안 될 때만 저장해 둔 화면을 꺼낸다.
// 시세 API(/api/)와 외부 사이트 요청은 건드리지 않는다.
const CACHE = 'argon-shell-v122';
const CDN = ['cdn.tailwindcss.com', 'cdn.jsdelivr.net'];
const SHELL = ['./', './index.html', './stocks.html', './assets.html', './lotto.html', './subway.html', './today.html', './routine.html', './sky.html', './allowance.html', './brain.html', './photoday.html', './meal.html', './kidbooks.html', './tickets.html', './jigsaw.html', './anime.html', './worklog.html', './santa.html', './bills.html', './growth.html', './search.html', './backup.html', './recap.html', './mygames.html', './visited.html', './til.html', './voice.html', './medical.html', './parcel.html', './renew.html', './fridge.html', './goals.html', './workout.html', './wish.html', './recipes.html', './market-events.js', './sizes.html', './daycare.html', './subs.html', './warranty.html', './supplies.html', './weekly.html', './leave.html', './trash.html', './timer.html', './health.html', './weather.html', './groupbuy.html', './firsts.html', './media.html', './places.html', './stash.html', './ceremony.html', './mood.html', './sleep.html', './tomica.html', './food.html', './games.html', './trip.html', './dict.html', './report.html', './car.html', './parking.html', './kidsay.html', './sticker.html', './fever.html', './kid.html', './fx.html', './habits.html', './habits-core.js', './food-db.js', './gift.html', './todo.html', './diary.html', './lunch.html', './dday.html', './english.html', './english-deck.js', './japanese.html', './japanese-deck.js', './lang-study.js', './quotes.js', './tax.html', './tax-calc.js', './tt.js', './theme.css', './commute.js', './pwa.js', './sync.js', './manifest.json', './icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // 화면 스타일·차트 라이브러리(CDN)는 저장본을 먼저 쓰고 뒤에서 갱신 → 오프라인에서도 모양 유지
  if (CDN.includes(url.hostname)) {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
    return;
  }
  if (url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)).then(r => r || Response.error()))
  );
});

// ---------- 아침 알림 ----------
// 서버는 내용 없는 push만 보낸다. 문구는 여기서 기기 안의 데이터(IndexedDB, pwa.js가 저장)로 만든다.
function readBrief() {
  return new Promise(res => {
    try {
      const rq = indexedDB.open('dd_notify', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => { const db = rq.result; const g = db.transaction('kv').objectStore('kv').get('brief'); g.onsuccess = () => { res(g.result || null); db.close(); }; g.onerror = () => res(null); };
      rq.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}
function composeBrief(b) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const pad = n => String(n).padStart(2, '0'), today = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  const dd = (s, yearly) => { const [y, m, d] = s.split('-').map(Number); let n = new Date(y, m - 1, d); if (yearly) { n = new Date(t.getFullYear(), m - 1, d); if (n < t) n = new Date(t.getFullYear() + 1, m - 1, d); } return Math.round((n - t) / 864e5); };
  const tag = k => k === 0 ? '오늘' : `D-${k}`, lines = [];
  if (b) {
    (b.gifts || []).map(x => [x, dd(x.exp)]).filter(([, k]) => k >= 0 && k <= 3).sort((a, b) => a[1] - b[1]).slice(0, 3)
      .forEach(([x, k]) => lines.push(`🎁 ${x.n}${x.s ? ` (${x.s})` : ''} 만료 ${k === 0 ? '오늘까지' : `D-${k}`}`));
    (b.ddays || []).map(x => [x, dd(x.date, x.y)]).filter(([, k]) => [0, 1, 3, 7, 30, 100].includes(k)).sort((a, b) => a[1] - b[1]).slice(0, 3)
      .forEach(([x, k]) => lines.push(`${x.e} ${x.n} ${k === 0 ? 'D-DAY 🎉' : tag(k)}`));
    (b.kids || []).forEach(x => { const [, m, d] = x.b.split('-'); const k = dd(`2000-${m}-${d}`, true); if ([0, 1, 7].includes(k)) lines.push(`🎂 ${x.n} 생일 ${k === 0 ? '오늘! 🎉' : tag(k)}`); });
    if (b.tomica && t.getDay() === 6 && t.getDate() >= 15 && t.getDate() <= 21) lines.push('🚗 오늘은 토미카 신차 나오는 날!');
    (b.ceremony || []).forEach(c => { const k = dd(c.d); if (k === 0 || k === 1) lines.push(`💐 ${k ? '내일' : '오늘'} ${c.p} ${String(c.k).split(' ').pop()}`); });
    const tr = (b.trash || []).filter(x => x.d.includes(t.getDay())); if (tr.length) lines.push(`${tr[0].e} 오늘 ${tr.map(x => x.n).join('·')} 내놓는 날`);
    (b.leave || []).forEach(l => { const k = dd(l.d); if (k === 0) lines.push(`🏖️ 오늘 ${l.k}! 푹 쉬어요`); else if (k === 1) lines.push(`🏖️ 내일 ${l.k}`); });
    if (t.getDay() === 1) lines.push('📰 지난주 정리가 나왔어요');
    const addD = (s, n) => { const [y, m, d] = s.split('-').map(Number), x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
    const sup = (b.supplies || []).filter(x => x.l && dd(addD(x.l, x.c)) <= 0); if (sup.length) lines.push(`🔧 바꿀 때 됐어요: ${sup.slice(0, 3).map(x => x.n).join(', ')}${sup.length > 3 ? '…' : ''}`);
    (b.subs || []).forEach(s => { let nx = s.nx, i = 0; while (nx && dd(nx) < 0 && i++ < 60) { const [y, m] = nx.split('-').map(Number); nx = s.y ? `${y + 1}${nx.slice(4)}` : (() => { const x = new Date(y, m, 1), last = new Date(y, m + 1, 0).getDate(); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(Math.min(s.d || 1, last))}`; })(); }
      if (nx && s.a > 0 && dd(nx) === 0) lines.push(`🧾 오늘 ${s.n} 결제 ${Number(s.a || 0).toLocaleString()}원`); if (s.t && [0, 1].includes(dd(s.t))) lines.push(`⏳ ${s.n} 무료체험 ${dd(s.t) ? '내일' : '오늘'} 끝나요`); });
    (b.warranty || []).forEach(x => { const [y, m, d] = x.d.split('-').map(Number), e = new Date(y, m - 1 + x.m, d - 1), k = dd(`${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())}`); if ([0, 1, 7, 30].includes(k)) lines.push(`📦 ${x.n} 보증 ${k ? `D-${k}` : '오늘까지'}`); });
    if (b.daycare) { const dc = [...(b.daycare.items || []).filter(i => i.d === today).map(i => i.x), ...(b.daycare.weekly || []).filter(w => (w.days || []).includes(t.getDay())).map(w => w.x)]; if (dc.length) lines.push(`🎒 오늘 어린이집: ${dc.slice(0, 3).join(', ')}${dc.length > 3 ? '…' : ''}`); }
    if (self.MarketEvents) self.MarketEvents.macro(today, 1).filter(e => e.date === today).forEach(e => lines.push(`${e.ico} ${+e.time.slice(0, 2) < 7 ? '오늘 새벽' : +e.time.slice(0, 2) >= 18 ? '오늘 밤' : '오늘'} ${e.time} ${e.name}`));
    (b.earn || []).filter(e => e.d === today).forEach(e => lines.push(`📣 ${e.t ? `오늘 ${e.t} ` : '오늘 '}${e.n} 실적 발표`));
    { const f = (b.fridge || []).filter(x => dd(x.d) >= 0 && dd(x.d) <= 1); if (f.length) lines.push(`🥛 유통기한 ${f.length > 2 ? f.slice(0, 2).map(x => x.n).join('·') + ` 외 ${f.length - 2}개` : f.map(x => x.n).join('·')} — ${f.some(x => dd(x.d) === 0) ? '오늘까지' : '내일까지'}`); }
    (b.renew || []).filter(x => [30, 7, 1, 0].includes(dd(x.d))).forEach(x => lines.push(`📅 ${x.n} ${dd(x.d) === 0 ? '오늘 만료' : `만료 D-${dd(x.d)}`}`));
    { const p = (b.parcel || []).filter(x => dd(x.d) === 0); if (p.length) lines.push(`📦 오늘 도착 예정: ${p.map(x => x.n).slice(0, 3).join(', ')}`); }
    if (b.santa && (b.santa.i || b.santa.b)) { const ev = [['🎄 크리스마스', `${t.getFullYear()}-12-25`], ['🎈 어린이날', `${t.getFullYear()}-05-05`], ...(b.santa.bd || []).map(k => [`🎂 ${k.n} 생일`, k.d])]; ev.forEach(([n, d]) => { const x = dd(d, true); if ([14, 7, 3, 1].includes(x)) lines.push(`🎅 ${n} D-${x} — 준비한 선물 ${b.santa.b}개${b.santa.b ? '' : ', 아직 없어요!'}`); }); }
    if (b.otaku) { const td = new Date(); const an = (b.otaku.a || []).map(a => { const base = a.at * 1000 + a.dl * 864e5, W = 7 * 864e5, k = Date.now() >= base ? Math.floor((Date.now() - base) / W) + 1 : 0, ep = a.ep + k; return (!a.e || ep <= a.e) && new Date(base + k * W).toDateString() === td.toDateString() ? a.n : null; }).filter(Boolean), wt = (b.otaku.w || []).filter(w => (w.d || []).includes(td.getDay())).map(w => w.n), all = [...an, ...wt]; if (all.length) lines.push(`🍿 오늘 볼 것: ${all.slice(0, 4).join(', ')}${all.length > 4 ? ` 외 ${all.length - 4}` : ''}`); }
    (b.tickets || []).forEach(x => { if (x.s === 'booked' && x.d && dd(x.d) === 0) lines.push(`🎫 오늘 ${x.t ? x.t.slice(0, 5) + ' ' : ''}${x.n}${x.v ? ' @' + x.v : ''}`); if (x.s === 'want' && x.o && dd(x.o.slice(0, 10)) === 0) lines.push(`🔔 티켓 오픈 ${x.o.slice(11, 16)} — ${x.n}`); if (x.s === 'booked' && x.c && dd(x.c) === 0) lines.push(`⚠️ ${x.n} 무료 취소 오늘까지`); if (x.u && !x.d && [3, 1].includes(dd(x.u))) lines.push(`🖼️ ${x.n} 전시 D-${dd(x.u)}`); });
    (b.loans || []).forEach(x => { const n = dd(x.d); if (n <= 1) lines.push(`🏛️ 도서관 책 ${x.n}권 ${n < 0 ? `${-n}일 연체!` : n === 0 ? '오늘 반납' : '내일 반납'}`); });
    if ((b.meal || []).length) lines.push(`🍽️ 오늘 식단: ${b.meal.join(' / ')}`);
    (b.allow || []).filter(x => x.day === t.getDay()).forEach(x => lines.push(`🐷 ${x.n} 용돈 날 (${Number(x.amt).toLocaleString()}원)`));
    (b.sky || []).filter(x => dd(x.d) === 0).forEach(x => lines.push(`🌌 오늘 밤 ${x.t}`));
    (b.wish || []).filter(x => dd(x.d) === 0).forEach(x => lines.push(`🎁 ${x.n} 고민 기간 끝 — 아직 갖고 싶어요?`));
    (b.goals || []).forEach(x => { const k = dd(x.d); if (k === 0 || k === 1 || k === 7) lines.push(`🎯 ${x.n} 마감 ${k ? `D-${k}` : '오늘'}`); });
    { const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(); if (t.getDate() === last) lines.push('🗓️ 오늘은 이달 마지막 날 — 한 줄 회고 어때요?'); }
    (b.health || []).forEach(h => { const n = 1 - dd(h.s.slice(0, 10)); lines.push(`🩹 ${h.w && h.w !== 'me' ? '아이 ' : ''}${h.p} ${n}일째 · 오늘 상태 남겨요`); });
    (b.groupbuy || []).forEach(g => { const hm = s => s.slice(11, 16), ko = g.o ? dd(g.o.slice(0, 10)) : null, kc = g.c ? dd(g.c.slice(0, 10)) : null;
      if (ko === 0) lines.push(`🛒 오늘 ${hm(g.o)} 공구 오픈 · ${g.n}`); else if (kc === 0 || kc === 1) lines.push(`🛒 ${kc ? '내일' : '오늘'} ${hm(g.c)} 공구 마감 · ${g.n}`); });
    (b.games || []).forEach(g => { const k = dd(g.d); if ([0, 1, 7].includes(k)) lines.push(`🎮 ${g.t} ${k === 0 ? '오늘 출시! 🎉' : `D-${k}`}`); });
    if (b.trip) {
      (b.trip.trips || []).forEach(t => { const k = dd(t.s); if ([0, 1, 3, 7].includes(k)) lines.push(`${t.e || '✈️'} ${t.n} ${k === 0 ? '오늘 출발! 🧳' : `D-${k}`}`); });
      (b.trip.stays || []).forEach(s => { if (s.in === today) lines.push(`🏨 오늘 ${s.inT} 체크인 · ${s.n}`); if (s.out === today) lines.push(`🧳 오늘 ${s.outT} 체크아웃 · ${s.n}`); });
    }
    const td = (b.todos || []).filter(x => x.due && x.due <= today);
    if (td.length) lines.push(`✅ 오늘 할 일 ${td.length}개: ${td.slice(0, 3).map(x => x.n).join(', ')}${td.length > 3 ? '…' : ''}`);
    if (b.shop) lines.push(`🛒 장보기 ${b.shop}개 남음`);
  }
  return lines;
}
// 오늘 날씨 한두 줄 (open-meteo, 4초 안에 못 받으면 생략)
async function weatherLines(place) {
  try {
    const p = place && place.lat ? place : { name: '하남시', lat: 37.5393, lng: 127.2149 };
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}&timezone=Asia%2FSeoul&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=1`, { signal: ctl.signal });
    clearTimeout(timer); if (!r.ok) return [];
    const d = (await r.json()).daily, hi = Math.round(d.temperature_2m_max[0]), lo = Math.round(d.temperature_2m_min[0]), pop = d.precipitation_probability_max[0], code = d.weather_code[0];
    const snow = [71, 73, 75, 77, 85, 86].includes(code), icon = snow ? '🌨️' : pop >= 50 ? '🌧️' : code <= 1 ? '☀️' : code <= 3 ? '⛅' : '☁️';
    const out = [`${icon} ${p.name || '오늘'} ${lo}~${hi}℃${pop != null ? ` · ${snow ? '눈' : '비'} ${pop}%` : ''}`];
    if (pop >= 50) out.push(snow ? '☃️ 눈 소식 있어요 — 미끄럼 조심, 우산 챙기세요' : '☂️ 비 올 확률이 높아요 — 우산 챙기세요');
    if (lo <= -5) out.push('🥶 많이 추워요 — 패딩·장갑 챙기세요'); else if (lo <= 0) out.push('🧣 영하로 떨어져요 — 따뜻하게 입어요');
    if (hi >= 31) out.push('🥵 많이 더워요 — 물 자주 마셔요');
    return out;
  } catch (e) { return []; }
}
// 푸시를 받으면 반드시 알림을 띄운다 (안 띄우면 안드로이드·iOS가 알림을 막거나 구독을 끊음)
self.addEventListener('push', e => {
  const wait = (p, ms, d) => Promise.race([p, new Promise(r => setTimeout(() => r(d), ms))]);
  e.waitUntil((async () => {
    let lines = [];
    try {
      const b = await wait(readBrief(), 2000, null);
      lines = [...await wait(weatherLines(b && b.place), 4500, [])];
      try { lines.push(...composeBrief(b)); } catch (x) {}
    } catch (x) {}
    const m = lines.length ? { title: '☀️ 든든 아침 브리핑', body: lines.join('\n') } : { title: '☀️ 좋은 아침이에요', body: '오늘 날씨랑 출근길 확인하고 가요 🚇' };
    return self.registration.showNotification(m.title, { body: m.body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'dd-morning', renotify: true, data: { url: './today.html' } });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './today.html', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const w = list.find(c => c.url.startsWith(self.registration.scope));
    return w ? w.navigate(url).then(c => (c || w).focus()) : self.clients.openWindow(url);
  }));
});
