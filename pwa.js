// 홈 화면 앱 설치 (가계부·주식 현황 공통)
// - 서비스 워커 등록
// - 사이드 메뉴에 "📲 홈 화면에 앱 설치" 버튼 추가 (이미 앱으로 열었으면 숨김)
// - 안드로이드 크롬: 설치 창 바로 띄우기 / 아이폰·기타: 방법 안내
(function () {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  let deferred = null;

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { deferred = null; const b = document.getElementById('installAppBtn'); if (b) b.remove(); });

  function guide() {
    const steps = isIOS
      ? ['Safari 아래쪽 <b>공유 버튼</b>(네모에 위쪽 화살표)을 눌러요', '목록에서 <b>홈 화면에 추가</b>를 눌러요', '오른쪽 위 <b>추가</b>를 누르면 끝!']
      : ['브라우저 오른쪽 위 <b>메뉴(⋮)</b>를 눌러요', '<b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 눌러요', '<b>설치</b>를 누르면 끝!'];
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[60] bg-slate-900/50 flex items-end sm:items-center justify-center p-3';
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', '홈 화면에 앱 설치 방법');
    wrap.innerHTML = `<div class="card bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl">
        <div class="flex items-center gap-3 mb-3"><img src="icons/icon-192.png" alt="" class="w-11 h-11 rounded-xl"><div><p class="font-extrabold text-slate-900">홈 화면에 앱 설치</p><p class="text-xs text-slate-500">주소창 없이 앱처럼 열려요</p></div></div>
        <ol class="space-y-2 text-sm text-slate-700">${steps.map((s, i) => `<li class="flex gap-2"><span class="w-5 h-5 shrink-0 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">${i + 1}</span><span>${s}</span></li>`).join('')}</ol>
        ${isIOS && !/safari/i.test(ua) ? '<p class="text-[11px] text-amber-600 mt-3">카카오톡 등 앱 안에서 열었다면, 먼저 Safari로 열어주세요.</p>' : ''}
        <button type="button" class="mt-4 w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl">알겠어요</button>
      </div>`;
    const close = () => wrap.remove();
    wrap.addEventListener('click', e => { if (e.target === wrap || e.target.tagName === 'BUTTON') close(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
    document.body.appendChild(wrap);
    wrap.querySelector('button').focus();
  }

  async function install() {
    if (typeof closeSideNav === 'function') closeSideNav();
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) {}
      deferred = null;
      return;
    }
    guide();
  }

  function addButton() {
    const nav = document.getElementById('sideNav');
    if (!nav || standalone() || document.getElementById('installAppBtn')) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'installAppBtn';
    btn.className = 'w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-indigo-600 hover:bg-indigo-50';
    btn.textContent = '📲 홈 화면에 앱 설치';
    btn.addEventListener('click', install);
    let foot = nav.querySelector('.mt-auto');
    if (!foot) { foot = document.createElement('div'); foot.className = 'mt-auto pt-3 border-t border-slate-100'; nav.appendChild(foot); }
    foot.insertBefore(btn, foot.firstChild);
  }
  // 사이드 메뉴 맨 아래: 버전 · 업데이트 노트 (새 버전을 아직 안 봤으면 점 표시)
  const VERSION = '9.61';
  window.ARGON_VERSION = VERSION;
  function addVersion() {
    const nav = document.getElementById('sideNav');
    if (!nav || document.getElementById('versionNavBtn')) return;
    let foot = nav.querySelector('.mt-auto');
    if (!foot) { foot = document.createElement('div'); foot.className = 'mt-auto pt-3 border-t border-slate-100'; nav.appendChild(foot); }
    const seen = (() => { try { return localStorage.getItem('argon_seen_version'); } catch (e) { return null; } })();
    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'versionNavBtn';
    btn.className = 'w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 flex items-center justify-between';
    btn.innerHTML = `<span>🆕 업데이트 노트</span><span class="flex items-center gap-1.5"><span class="text-[10px] font-extrabold text-indigo-600">v${VERSION}</span>${seen !== VERSION ? '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>' : ''}</span>`;
    btn.addEventListener('click', () => {
      if (typeof openReleaseModal === 'function') { if (typeof closeSideNav === 'function') closeSideNav(); openReleaseModal(); }
      else location.href = './?notes=1';   // 업데이트 노트는 가계부 화면에 있음
    });
    foot.appendChild(btn);
  }
  // 아침 알림용: 알림 문구에 쓸 최소 데이터를 IndexedDB에 넣어둔다 (서비스 워커가 읽음 · 서버로 안 감)
  function saveBrief() {
    try {
      const L = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
      const g = L('argon_gift_v1'), d = L('argon_dday_v1'), t = L('argon_todo_v1'), kd = L('argon_kid_v1');
      const brief = {
        at: Date.now(),
        gifts: ((g && g.items) || []).filter(x => !x.used && x.exp).map(x => ({ n: x.name, s: x.store || '', exp: x.exp })).slice(0, 50),
        ddays: d ? (d.items || []).map(x => ({ n: x.name, e: x.emoji || '📅', date: x.date, y: !!x.yearly })).slice(0, 50)
          : [{ n: '크리스마스', e: '🎄', date: '2026-12-25', y: true }, { n: '새해', e: '🎆', date: '2027-01-01', y: true }, { n: '어린이날', e: '🎈', date: '2027-05-05', y: true }],
        todos: ((t && t.todos) || []).filter(x => !x.done).map(x => ({ n: x.text, due: x.due || '' })).slice(0, 50),
        shop: ((t && t.shop) || []).filter(x => !x.done).length,
        kids: ((kd && kd.kids) || []).map(x => ({ n: x.name, b: x.birth })),
        trip: (() => { const tr = L('argon_trip_v1'); return tr ? { trips: (tr.trips || []).map(x => ({ n: x.name, e: x.emoji, s: x.start, en: x.end, id: x.id })), stays: (tr.stays || []).map(x => ({ t: x.trip, n: x.name, in: x.in, inT: x.inT, out: x.out, outT: x.outT })) } : null; })(),
        games: ((L('argon_games_v1') || {}).fav || []).filter(f => f.d).map(f => ({ t: f.t, d: f.d })),
        tomica: Object.keys((L('argon_tomica_v1') || {}).own || {}).length,
        ceremony: ((L('argon_ceremony_v1') || {}).items || []).filter(x => x.dir === 'plan').map(x => ({ p: x.person, k: x.kind, d: x.date })),
        health: ((L('argon_health_v1') || {}).eps || []).filter(x => !x.end).map(x => ({ p: String(x.part).replace(/^\S+\s/, ''), s: x.start, w: x.who })),
        trash: ((L('argon_trash_v1') || {}).items || []).map(x => ({ n: String(x.name).replace(/^\S+\s/, ''), e: String(x.name).split(' ')[0], d: x.days || [] })),
        leave: ((L('argon_leave_v1') || {}).uses || []).filter(u => u.date >= new Date(Date.now() - 864e5).toISOString().slice(0, 10)).map(u => ({ d: u.date, k: u.kind })),
        supplies: ((L('argon_supplies_v1') || {}).items || []).map(x => ({ n: x.name, l: x.last, c: x.cycle })),
        subs: ((L('argon_subs_v1') || {}).items || []).filter(x => !x.off).map(x => ({ n: x.name, a: x.amt, nx: x.next, y: x.cyc === 'y', d: x.day, t: x.trial || '' })),
        warranty: ((L('argon_warranty_v1') || {}).items || []).filter(x => x.months).map(x => ({ n: x.name, d: x.date, m: x.months })),
        daycare: (() => { const v = L('argon_daycare_v1') || {}, t = new Date(), td = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; return { items: (v.items || []).filter(i => i.date >= td && !i.done).map(i => ({ d: i.date, x: i.text })), weekly: (v.weekly || []).map(w => ({ days: w.days, x: w.text })) }; })(),
        groupbuy: ((L('argon_groupbuy_v1') || {}).items || []).filter(x => !x.status || x.status === 'wait').map(x => ({ n: x.name, o: x.open || '', c: x.close || '' })),
        place: L('argon_today_place_v1') || { name: '하남시', lat: 37.5393, lng: 127.2149 }
      };
      const rq = indexedDB.open('dd_notify', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => { const db = rq.result; const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(brief, 'brief'); tx.oncomplete = () => db.close(); };
    } catch (e) {}
  }
  window.saveBrief = saveBrief;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveBrief(); });
  // 사이드 메뉴를 카테고리로 묶기 (오늘은 맨 위 그대로, 나머지는 접었다 펴는 그룹)
  const NAV_GROUPS = [
    ['rec', '📝', '기록', ['weekly.html', 'diary.html', 'mood.html', 'todo.html', 'habits.html', 'food.html', 'timer.html', 'sleep.html', 'health.html', 'dday.html']],
    ['kid', '👶', '아이', ['kid.html', 'fever.html', 'sticker.html', 'kidsay.html', 'firsts.html', 'daycare.html', 'sizes.html']],
    ['money', '💰', '자산관리', ['', 'index.html', 'report.html', 'ceremony.html', 'subs.html', 'stocks.html', 'assets.html', 'tax.html', 'lotto.html']],
    ['life', '🚇', '생활', ['weather.html', 'subway.html', 'lunch.html', 'places.html', 'gift.html', 'groupbuy.html', 'parking.html', 'stash.html', 'trash.html', 'supplies.html', 'warranty.html', 'car.html', 'leave.html']],
    ['hobby', '🎮', '취미', ['games.html', 'tomica.html', 'media.html']],
    ['trip', '✈️', '여행·공부', ['trip.html', 'fx.html', 'english.html', 'dict.html']]
  ];
  // 메뉴 검색용 다른 이름들 (메뉴 이름에 없는 말로 찾을 때)
  const NAV_KW = {
    'today.html': '오늘 홈 메인 브리핑', '': '가계부 지출 수입 돈 소비 카드 결제', 'index.html': '가계부 지출 수입 돈 소비 카드 결제', 'report.html': '리포트 소비 분석 통계 줄일',
    'ceremony.html': '축의금 조의금 결혼 장례 부조 돌잔치', 'subs.html': '구독 넷플릭스 유튜브 정기결제 OTT 티빙 쿠팡', 'stocks.html': '주식 증권 코스피 코스닥 토스 관심종목', 'assets.html': '자산 순자산 계좌 예금',
    'tax.html': '연말정산 세금 공제', 'lotto.html': '로또 복권 당첨', 'weather.html': '날씨 기온 일출 일몰 미세먼지 비 눈 주간', 'subway.html': '지하철 출근 퇴근 열차 도착 막차',
    'lunch.html': '점심 메뉴 룰렛 밥 뭐먹지', 'places.html': '맛집 장소 카페 식당', 'gift.html': '기프티콘 쿠폰 선물 바코드', 'groupbuy.html': '공구 공동구매 오픈 마감', 'parking.html': '주차 몇층',
    'stash.html': '물건 위치 어디뒀 보관', 'trash.html': '쓰레기 재활용 분리배출 음식물 페트', 'supplies.html': '필터 칫솔 교체 소모품 청소 주기', 'warranty.html': '보증 영수증 AS 가전 시리얼',
    'car.html': '차 자동차 주유 정비 엔진오일', 'leave.html': '연차 휴가 반차 공휴일 징검다리 쉬는날', 'diary.html': '일기 한줄 메모', 'mood.html': '기분 컨디션 감정', 'todo.html': '할일 장보기 체크리스트',
    'habits.html': '습관 물 운동 영양제 루틴', 'food.html': '칼로리 음식 식단 다이어트 식약처', 'timer.html': '타이머 뽀모도로 집중 휴식 스톱워치', 'sleep.html': '잠 수면 낮잠 기상',
    'health.html': '아플때 통증 병원 약 허리 증상 몸', 'dday.html': '디데이 기념일 생일 카운트', 'weekly.html': '주간 리포트 이번주 정리 요약', 'kid.html': '아이 성장 키 몸무게 예방접종',
    'fever.html': '열 체온 해열제 열나요', 'sticker.html': '칭찬 스티커 보상', 'kidsay.html': '어록 아이 말 대화', 'firsts.html': '처음 첫 걸음마 순간', 'daycare.html': '어린이집 유치원 준비물 알림장',
    'sizes.html': '사이즈 옷 신발 기저귀 치수', 'games.html': '게임 출시 발매 캘린더', 'tomica.html': '토미카 장난감 미니카 신차', 'media.html': '책 영화 드라마 애니 공연 콘텐츠 독서',
    'trip.html': '여행 숙소 일정 체크인', 'fx.html': '환율 달러 엔 유로 환전', 'english.html': '영어 회화 문장', 'japanese.html': '일본어 회화', 'dict.html': '사전 단어 뜻 국어'
  };
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const cho = s => [...s].map(c => { const n = c.charCodeAt(0) - 0xAC00; return n >= 0 && n < 11172 ? CHO[Math.floor(n / 588)] : c; }).join('');
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '');
  function navSearch(nav, links, wrap, file, groupOf) {
    const box = document.createElement('div'); box.className = 'mb-1';
    box.innerHTML = '<div class="relative"><input id="navQ" type="search" autocomplete="off" placeholder="🔍 메뉴 찾기 (예: 넷플릭스, ㄱㄷ)" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300"></div><div id="navRes" class="hidden flex flex-col gap-0.5 mt-1"></div>';
    const q = box.querySelector('#navQ'), res = box.querySelector('#navRes');
    const items = links.map(a => { const f = file(a), label = a.textContent.replace(/\s+/g, ' ').trim(); return { a, f, label, name: norm(label.replace(/^\S+\s/, '')), kw: norm(NAV_KW[f] || ''), kws: (NAV_KW[f] || '').split(' ').map(norm), g: groupOf(a) }; });
    let recent = []; try { recent = JSON.parse(localStorage.getItem('nav_recent') || '[]'); } catch (e) {}
    const tdy = links.find(a => file(a) === 'today.html'), show = on => { wrap.classList.toggle('hidden', !on); if (tdy) tdy.classList.toggle('hidden', !on); };
    const row = (it, i) => `<a href="${it.a.getAttribute('href')}" class="nav-item flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold ${i === 0 ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'}">${it.a.innerHTML}<span class="ml-auto text-[10px] font-bold text-slate-400">${it.g}</span></a>`;
    function run() {
      const v = norm(q.value);
      if (!v) {
        const rs = recent.map(f => items.find(it => it.f === f)).filter(Boolean).slice(0, 5);
        if (document.activeElement === q && rs.length) { res.innerHTML = '<p class="px-3 pt-1 text-[10px] font-bold text-slate-400">최근 본 메뉴</p>' + rs.map((it, i) => row(it, -1)).join(''); res.classList.remove('hidden'); show(false); }
        else { res.classList.add('hidden'); show(true); }
        return;
      }
      const onlyCho = /^[ㄱ-ㅎ]+$/.test(v);
      const score = it => { const n = it.name; if (onlyCho) { const c = cho(n); return c === v ? 4 : c.startsWith(v) ? 3 : c.includes(v) ? 2 : it.kws.some(k => cho(k).startsWith(v)) ? 1 : 0; }
        return n === v ? 7 : n.startsWith(v) ? 6 : n.includes(v) ? 5 : it.kws.includes(v) ? 4.5 : it.kws.some(k => k.startsWith(v)) ? 4 : it.kw.includes(v) ? 3 : norm(it.g).includes(v) ? 2 : 0; };
      const hit = items.map(it => [it, score(it)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
      res.innerHTML = hit.length ? hit.map(row).join('') : '<p class="px-3 py-2 text-xs font-bold text-slate-400">찾는 메뉴가 없어요</p>';
      res.classList.remove('hidden'); show(false);
    }
    q.addEventListener('input', run); q.addEventListener('focus', run);
    q.addEventListener('blur', () => setTimeout(() => { if (!q.value) run(); }, 150));
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { const a = res.querySelector('a'); if (a) location.href = a.getAttribute('href'); } if (e.key === 'Escape') { q.value = ''; run(); q.blur(); } });
    // 데스크톱: / 또는 Ctrl+K 로 바로 찾기
    document.addEventListener('keydown', e => { const t = (document.activeElement || {}).tagName; if (((e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(t)) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'))) { e.preventDefault(); if (window.openSideNav) window.openSideNav(); setTimeout(() => q.focus(), 50); } });
    return box;
  }
  function rememberPage() { try { const f = location.pathname.split('/').pop() || ''; if (f === 'today.html') return; let r = JSON.parse(localStorage.getItem('nav_recent') || '[]'); r = [f, ...r.filter(x => x !== f)].slice(0, 8); localStorage.setItem('nav_recent', JSON.stringify(r)); } catch (e) {} }
  function groupNav() {
    const nav = document.getElementById('sideNav');
    if (!nav || nav.dataset.grouped) return; nav.dataset.grouped = '1';
    const css = document.createElement('style');
    css.textContent = '.dark .nav-group{color:#e2e8f0}.dark .nav-group:hover{background:#334155}.dark #sideNav .border-slate-100{border-color:#334155}';
    document.head.appendChild(css);
    const file = a => (a.getAttribute('href') || '').replace(/^\.\//, '').replace(/[?#].*$/, '');
    const links = [...nav.querySelectorAll(':scope > a.nav-item')];
    const today = links.find(a => file(a) === 'today.html'), foot = nav.querySelector('.mt-auto');
    let open = {}; try { open = JSON.parse(localStorage.getItem('nav_open') || '{}'); } catch (e) {}
    const used = new Set(today ? [today] : []);
    const groups = NAV_GROUPS.map(g => [g, links.filter(a => g[3].includes(file(a))).sort((a, b) => g[3].indexOf(file(a)) - g[3].indexOf(file(b)))]);
    const rest = links.filter(a => !used.has(a) && !groups.some(([, ls]) => ls.includes(a)));
    if (rest.length) groups.push([['etc', '✨', '더보기', []], rest]);
    const wrap = document.createElement('div'); wrap.className = 'flex-1 flex flex-col gap-0.5 overflow-y-auto -mx-1 px-1 min-h-0';
    groups.forEach(([[id, emoji, name], ls]) => {
      if (!ls.length) return;
      const active = ls.some(a => a.classList.contains('active')), isOpen = open[id] !== undefined ? open[id] : active;
      const head = document.createElement('button'); head.type = 'button';
      head.className = 'nav-group flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-extrabold text-slate-800 hover:bg-slate-100 w-full text-left mt-1';
      head.setAttribute('aria-expanded', String(isOpen));
      head.innerHTML = `<span>${emoji}</span><span class="flex-1">${name}</span><span class="text-[10px] font-bold text-slate-400">${ls.length}</span><span class="nav-chev text-xs text-slate-400 transition-transform" style="transform:rotate(${isOpen ? 90 : 0}deg)">▸</span>`;
      const box = document.createElement('div'); box.className = 'flex flex-col gap-0.5 pl-3 ml-3 border-l-2 border-slate-100' + (isOpen ? '' : ' hidden');
      ls.forEach(a => { a.classList.remove('py-2.5'); a.classList.add('py-2'); box.appendChild(a); });
      head.addEventListener('click', () => {
        const now = box.classList.toggle('hidden') === false;
        head.setAttribute('aria-expanded', String(now)); head.querySelector('.nav-chev').style.transform = `rotate(${now ? 90 : 0}deg)`;
        open[id] = now; try { localStorage.setItem('nav_open', JSON.stringify(open)); } catch (e) {}
      });
      wrap.appendChild(head); wrap.appendChild(box);
    });
    if (today) today.after(wrap); else if (foot) nav.insertBefore(wrap, foot); else nav.appendChild(wrap);
    const groupOf = a => { const g = groups.find(([, ls]) => ls.includes(a)); return g ? g[0][2] : ''; };
    const sbox = navSearch(nav, links, wrap, file, groupOf);
    const first = today || wrap; first.parentNode.insertBefore(sbox, first);
  }
  function init() { rememberPage(); groupNav(); addButton(); addVersion(); saveBrief(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.installApp = install;
})();
