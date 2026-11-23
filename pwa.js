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
  const VERSION = '9.2';
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
  function init() { addButton(); addVersion(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.installApp = install;
})();
