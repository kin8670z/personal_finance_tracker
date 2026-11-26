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
  const VERSION = '9.52';
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
    ['rec', '📝', '기록', ['diary.html', 'mood.html', 'todo.html', 'habits.html', 'food.html', 'timer.html', 'sleep.html', 'health.html', 'dday.html']],
    ['kid', '👶', '아이', ['kid.html', 'fever.html', 'sticker.html', 'kidsay.html', 'firsts.html']],
    ['money', '💰', '자산관리', ['', 'index.html', 'report.html', 'ceremony.html', 'stocks.html', 'assets.html', 'tax.html', 'lotto.html']],
    ['life', '🚇', '생활', ['weather.html', 'subway.html', 'lunch.html', 'places.html', 'gift.html', 'groupbuy.html', 'parking.html', 'stash.html', 'car.html']],
    ['hobby', '🎮', '취미', ['games.html', 'tomica.html', 'media.html']],
    ['trip', '✈️', '여행·공부', ['trip.html', 'fx.html', 'english.html', 'dict.html']]
  ];
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
  }
  function init() { groupNav(); addButton(); addVersion(); saveBrief(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.installApp = install;
})();
