// ☁️ 기기 동기화 (가계부·주식 현황·내 자산 공통)
// - 데이터는 이 기기에서 비밀번호로 암호화해서 올린다(AES-GCM). 서버에는 암호문만 있다.
// - 데이터 키(DK)는 무작위로 만들고, 비밀번호와 복구 코드로 각각 감싸서(PBKDF2 → AES-GCM) 서버에 둔다.
// - 앱을 열 때·다시 볼 때 최신 데이터를 받고, 고치면 몇 초 뒤 자동으로 올린다.
// - 두 기기에서 동시에 고치면 나중에 고친 쪽을 저장하고 알려준다. 서버는 바로 전 버전 1개를 보관한다.
(function () {
  const API = './api/sync';
  const STATE_KEY = 'argon_sync_v1', LOCAL_BACKUP = 'argon_sync_localbackup';
  // 기기마다 다르게 두는 화면 설정은 동기화하지 않음
  const SKIP = new Set([STATE_KEY, LOCAL_BACKUP, 'argon_seen_version', 'argon_dark_mode', 'argon_watch_market_v1', 'argon_watch_range_v1', 'argon_watch_range_v2', 'argon_watch_detail_v1', 'argon_watch_candle_v1']);
  const ITER = 310000, B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const enc = new TextEncoder(), dec = new TextDecoder(), subtle = window.crypto && crypto.subtle;
  const rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
  const synced = k => k && k.startsWith('argon_') && !SKIP.has(k);

  // ---------- 작은 도구 ----------
  const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rand = n => crypto.getRandomValues(new Uint8Array(n));
  const randB32 = n => Array.from(rand(n), b => B32[b & 31]).join('');
  const group = s => s.replace(/(.{4})(?=.)/g, '$1-');
  const clean = s => String(s || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function device() { const u = navigator.userAgent; return /iphone/i.test(u) ? 'iPhone' : /ipad/i.test(u) ? 'iPad' : /android/i.test(u) ? 'Android' : /mac/i.test(u) ? 'Mac' : /windows/i.test(u) ? 'Windows PC' : '기기'; }
  const loadState = () => { try { return JSON.parse(localStorage.getItem(STATE_KEY)) || null; } catch (e) { return null; } };
  const saveState = s => s ? rawSet.call(localStorage, STATE_KEY, JSON.stringify(s)) : rawRemove.call(localStorage, STATE_KEY);
  let state = loadState();

  // ---------- 암호화 ----------
  async function kek(secret, salt) {
    const base = await subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function wrap(dkRaw, secret) {
    const salt = rand(16), iv = rand(12), key = await kek(secret, salt);
    return { salt: b64(salt), iv: b64(iv), ct: b64(await subtle.encrypt({ name: 'AES-GCM', iv }, key, dkRaw)) };
  }
  async function unwrap(w, secret) {
    const key = await kek(secret, unb64(w.salt));
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv) }, key, unb64(w.ct)));   // 틀리면 예외
  }
  const dataKey = raw => subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  async function tokenOf(dkRaw) { return b64(await subtle.digest('SHA-256', new Uint8Array([...enc.encode('argon-sync-token:'), ...dkRaw]))); }
  async function gzip(bytes) {
    if (!window.CompressionStream) return bytes;
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  }
  async function gunzip(bytes) {
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  }
  async function seal(dkRaw, obj) {
    const iv = rand(12), body = await gzip(enc.encode(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(await subtle.encrypt({ name: 'AES-GCM', iv }, await dataKey(dkRaw), body)), device: device() };
  }
  async function open(dkRaw, blob) {
    const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, await dataKey(dkRaw), unb64(blob.ct)));
    return JSON.parse(dec.decode(await gunzip(plain)));
  }

  // ---------- 로컬 데이터 ----------
  function snapshot() {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (synced(k)) o[k] = localStorage.getItem(k); }
    return { v: 1, at: new Date().toISOString(), data: o };
  }
  function apply(snap) {
    const keep = snapshot();
    rawSet.call(localStorage, LOCAL_BACKUP, JSON.stringify(keep));   // 덮어쓰기 전 이 기기 데이터 보관
    const keys = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (synced(k)) keys.push(k); }
    keys.forEach(k => { if (!(k in snap.data)) rawRemove.call(localStorage, k); });
    Object.entries(snap.data || {}).forEach(([k, v]) => { if (synced(k)) rawSet.call(localStorage, k, v); });
  }

  // ---------- 서버 ----------
  async function api(body) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || `오류 (${r.status})`), { status: r.status, body: j });
    return j;
  }
  async function getMeta(id) {
    const r = await fetch(`${API}?op=meta&id=${id}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `오류 (${r.status})`);
    return j.meta;
  }

  // ---------- 동기화 동작 ----------
  let busy = false, pushTimer = null;
  async function create(password) {
    const id = randB32(16), dkRaw = rand(32), rec = randB32(24), token = await tokenOf(dkRaw);
    const meta = { v: 1, iter: ITER, p: await wrap(dkRaw, password), r: await wrap(dkRaw, rec) };
    const tokenHash = hex(await subtle.digest('SHA-256', enc.encode(token)));
    const r = await api({ op: 'create', id, meta, tokenHash, blob: await seal(dkRaw, snapshot()) });
    state = { id, dk: b64(dkRaw), token, rev: r.rev, syncedAt: r.updatedAt, dirtyAt: null };
    saveState(state); badge();
    return { id, rec };
  }
  // 다른 기기에서 만든 동기화에 연결: 비밀번호 또는 복구 코드(+새 비밀번호)
  async function connect(id, secret, useRecovery, newPassword) {
    const meta = await getMeta(id);
    let dkRaw;
    try { dkRaw = await unwrap(useRecovery ? meta.r : meta.p, useRecovery ? clean(secret) : secret); }
    catch (e) { throw new Error(useRecovery ? '복구 코드가 맞지 않아요' : '비밀번호가 맞지 않아요'); }
    const token = await tokenOf(dkRaw);
    if (useRecovery) await api({ op: 'rekey', id, token, meta: { ...meta, p: await wrap(dkRaw, newPassword) } });
    const blob = await api({ op: 'pull', id, token });
    const snap = blob.rev ? await open(dkRaw, blob) : { data: {} };
    return { commit() { apply(snap); state = { id, dk: b64(dkRaw), token, rev: blob.rev || 0, syncedAt: blob.updatedAt || null, dirtyAt: null }; saveState(state); }, count: Object.keys(snap.data || {}).length, at: blob.updatedAt, device: blob.device };
  }
  async function pull(manual) {
    if (!state || busy || !navigator.onLine) return;
    busy = true;
    try {
      const blob = await api({ op: 'pull', id: state.id, token: state.token });
      if (!blob.rev || blob.rev <= state.rev) { busy = false; if (state.dirtyAt) schedulePush(0); else if (manual) toast('☁️ 이미 최신이에요'); stamp(); return; }
      if (state.dirtyAt && state.dirtyAt > Date.parse(blob.updatedAt)) {
        // 이 기기에서 더 나중에 고침 → 이 기기 내용을 저장
        busy = false; await push(true);
        toast(`⚠️ ${esc(blob.device || '다른 기기')}에서도 고쳤지만, 더 나중에 고친 이 기기 내용으로 저장했어요. 필요하면 동기화 설정에서 서버 이전 버전으로 되돌릴 수 있어요.`, 8000);
        return;
      }
      const snap = await open(unb64(state.dk), blob);
      const lostLocal = !!state.dirtyAt;
      apply(snap);
      state = { ...state, rev: blob.rev, syncedAt: blob.updatedAt, dirtyAt: null }; saveState(state);
      sessionStorage.setItem('argon_sync_toast', lostLocal ? `☁️ ${blob.device || '다른 기기'}에서 더 나중에 고친 내용으로 바꿨어요. 이 기기의 직전 데이터는 동기화 설정에서 되돌릴 수 있어요.` : `☁️ ${blob.device || '다른 기기'}에서 바꾼 최신 내용을 불러왔어요`);
      location.reload();
    } catch (e) {
      if (e.status === 403 || e.status === 404) { toast('☁️ 동기화 정보가 서버에 없어요. 다른 기기에서 삭제했을 수 있어요. 동기화 설정을 확인해 주세요.', 8000); }
      else if (manual) toast('☁️ 동기화 실패: ' + esc(e.message));
    }
    busy = false;
  }
  async function push(force) {
    if (!state || (!state.dirtyAt && !force)) return;
    if (busy && !force) { schedulePush(1500); return; }
    busy = true;
    const startedAt = Date.now();
    try {
      const blob = await seal(unb64(state.dk), snapshot());
      let r;
      try { r = await api({ op: 'push', id: state.id, token: state.token, baseRev: state.rev, force: !!force, blob }); }
      catch (e) {
        if (e.status !== 409) throw e;
        // 그사이 다른 기기가 올림 → 지금 막 고친 이 기기 내용이 더 나중이라 저장하고 알림
        r = await api({ op: 'push', id: state.id, token: state.token, baseRev: e.body.rev, force: true, blob });
        toast(`⚠️ ${esc(e.body.device || '다른 기기')}에서도 바꾼 내용이 있었는데, 더 나중에 고친 이 기기 내용으로 저장했어요. 동기화 설정에서 서버 이전 버전으로 되돌릴 수 있어요.`, 8000);
      }
      const stillDirty = state.dirtyAt && state.dirtyAt > startedAt;   // 올리는 사이 또 고침
      state = { ...state, rev: r.rev, syncedAt: r.updatedAt, dirtyAt: stillDirty ? state.dirtyAt : null }; saveState(state);
      if (stillDirty) schedulePush(1500);
    } catch (e) {
      console.warn('sync push', e);
      if (e.status === 413) toast('☁️ 데이터가 너무 커서 동기화하지 못했어요 (3MB 이하)', 6000);
      schedulePush(30000);   // 오프라인 등 → 나중에 다시
    }
    busy = false; stamp();
  }
  function schedulePush(ms) { clearTimeout(pushTimer); pushTimer = setTimeout(() => push(false), ms == null ? 2500 : ms); }

  // localStorage에 저장할 때 바뀐 게 있으면 '고침' 표시 → 잠시 뒤 자동으로 올리기
  Storage.prototype.setItem = function (k, v) {
    const changed = this === localStorage && synced(k) && localStorage.getItem(k) !== String(v);
    rawSet.call(this, k, v);
    if (changed && state) { state.dirtyAt = Date.now(); saveState(state); schedulePush(); }
  };
  Storage.prototype.removeItem = function (k) {
    const changed = this === localStorage && synced(k) && localStorage.getItem(k) !== null;
    rawRemove.call(this, k);
    if (changed && state) { state.dirtyAt = Date.now(); saveState(state); schedulePush(); }
  };

  // ---------- 화면 ----------
  function toast(html, ms = 4000) {
    const t = document.createElement('div');
    t.setAttribute('role', 'status');
    t.className = 'fixed left-1/2 -translate-x-1/2 bottom-5 z-[70] max-w-sm w-[calc(100%-1.5rem)] bg-slate-900 text-white text-xs font-bold rounded-xl px-4 py-3 shadow-2xl leading-relaxed';
    t.innerHTML = html; document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }
  const ago = iso => { if (!iso) return '-'; const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? '방금' : s < 3600 ? `${Math.floor(s / 60)}분 전` : s < 86400 ? `${Math.floor(s / 3600)}시간 전` : new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  function stamp() { const el = document.getElementById('syncStatusLine'); if (el && state) el.textContent = `마지막 동기화 ${ago(state.syncedAt)}${state.dirtyAt ? ' · 올릴 변경 있음' : ''}`; badge(); }
  function badge() { const b = document.getElementById('syncNavBtn'); if (b) b.innerHTML = `☁️ 기기 동기화 <span class="ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${state ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${state ? '켜짐' : '꺼짐'}</span>`; }

  let modal = null;
  function closeModal() { if (modal) { modal.remove(); modal = null; } }
  function show(inner) {
    closeModal();
    modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[60] bg-slate-900/50 flex items-end sm:items-center justify-center p-3';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', '기기 동기화');
    modal.innerHTML = `<div class="card bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-auto">${inner}</div>`;
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.body.appendChild(modal);
    const f = modal.querySelector('input'); if (f) f.focus();
    return modal;
  }
  const head = (title, sub) => `<div class="flex items-start justify-between gap-2 mb-3"><div><p class="font-extrabold text-slate-900">${title}</p>${sub ? `<p class="text-xs text-slate-500 mt-0.5">${sub}</p>` : ''}</div><button type="button" data-close class="text-slate-400 text-lg font-bold px-1" aria-label="닫기">✕</button></div>`;
  const inp = (id, label, type = 'password', ph = '', extra = '') => `<label class="block text-[11px] font-bold text-slate-500">${label}<input id="${id}" type="${type}" placeholder="${ph}" ${extra} class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"></label>`;
  const btn = (id, text, cls = 'bg-indigo-600 text-white') => `<button type="button" id="${id}" class="w-full py-2.5 rounded-xl font-bold text-sm ${cls}">${text}</button>`;
  const err = () => `<p id="syncErr" class="text-xs text-rose-600 hidden"></p>`;
  function fail(m) { const e = modal && modal.querySelector('#syncErr'); if (e) { e.textContent = m; e.classList.remove('hidden'); } }
  function wire(map) { modal.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal); Object.entries(map).forEach(([id, fn]) => { const el = modal.querySelector('#' + id); if (el) el.onclick = fn; }); }
  async function working(btnId, fn) {
    const b = modal.querySelector('#' + btnId), t = b.textContent; b.disabled = true; b.textContent = '잠시만요…'; b.style.opacity = '.6';
    try { await fn(); } catch (e) { fail(e.message || '실패했어요'); } finally { if (b.isConnected) { b.disabled = false; b.textContent = t; b.style.opacity = ''; } }
  }

  function openSync() {
    if (typeof closeSideNav === 'function') closeSideNav();
    if (!subtle) return show(head('☁️ 기기 동기화') + '<p class="text-sm text-slate-600">이 브라우저는 암호화 기능을 지원하지 않아요. 최신 크롬·사파리에서 열어주세요.</p>'), wire({});
    state ? viewOn() : viewOff();
  }
  function viewOff() {
    show(head('☁️ 기기 동기화', '폰과 PC에서 같은 데이터를 봐요') + `
      <ul class="text-xs text-slate-600 space-y-1 mb-4">
        <li>🔒 이 기기에서 <b>비밀번호로 암호화</b>해서 올려요. 서버도 내용을 못 봐요.</li>
        <li>🔄 고치면 자동으로 올리고, 앱을 열면 최신으로 받아요.</li>
        <li>🔑 비밀번호를 잊어도 <b>복구 코드</b>로 열 수 있어요.</li>
      </ul>
      <div class="space-y-2">${btn('sNew', '이 기기 데이터로 새로 시작')}${btn('sJoin', '다른 기기에서 만든 동기화 연결', 'bg-white border border-slate-200 text-slate-700')}</div>`);
    wire({ sNew: viewCreate, sJoin: viewJoin });
  }
  function viewCreate() {
    show(head('새 동기화 만들기', '지금 이 기기 데이터를 올려요') + `<div class="space-y-2">
      ${inp('sPw', '비밀번호 (8자 이상)', 'password', '', 'autocomplete="new-password"')}${inp('sPw2', '비밀번호 확인', 'password', '', 'autocomplete="new-password"')}
      <p class="text-[11px] text-slate-400">이 비밀번호는 서버로 가지 않아요. 다른 기기에서 연결할 때 필요해요.</p>
      ${err()}${btn('sGo', '만들기')}</div>`);
    wire({ sGo: () => working('sGo', async () => {
      const p = modal.querySelector('#sPw').value, p2 = modal.querySelector('#sPw2').value;
      if (p.length < 8) throw new Error('비밀번호는 8자 이상으로 해주세요.');
      if (p !== p2) throw new Error('비밀번호 확인이 달라요.');
      const { id, rec } = await create(p);
      viewKeys(id, rec);
    }) });
  }
  function viewKeys(id, rec) {
    const box = (label, v) => `<div class="bg-slate-50 border border-slate-200 rounded-xl p-3"><p class="text-[11px] font-bold text-slate-500">${label}</p><div class="flex items-center gap-2 mt-1"><code class="flex-1 font-mono font-extrabold text-sm text-slate-900 break-all">${v}</code><button type="button" data-copy="${v}" class="shrink-0 text-xs font-bold text-indigo-600 px-2 py-1 rounded-md bg-indigo-50">복사</button></div></div>`;
    show(head('✅ 동기화를 켰어요', '아래 두 가지를 꼭 저장해 두세요') + `<div class="space-y-2">
      ${box('동기화 ID (다른 기기 연결할 때)', group(id))}
      ${box('복구 코드 (비밀번호를 잊었을 때, 다시 안 보여줘요)', group(rec))}
      <p class="text-[11px] text-amber-600 font-bold">복구 코드는 지금만 보여줘요. 메모 앱이나 비밀번호 관리자에 저장해 두세요.</p>
      <label class="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" id="sSaved"> 안전한 곳에 저장했어요</label>
      ${btn('sDone', '완료')}</div>`);
    modal.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = '복사됨'; } catch (e) { b.textContent = '길게 눌러 복사'; } });
    const done = modal.querySelector('#sDone'); done.disabled = true; done.style.opacity = '.5';
    modal.querySelector('#sSaved').onchange = e => { done.disabled = !e.target.checked; done.style.opacity = e.target.checked ? '' : '.5'; };
    modal.querySelector('[data-close]').remove();
    done.onclick = () => { closeModal(); toast('☁️ 동기화를 켰어요. 다른 기기에서 ID와 비밀번호로 연결하세요.'); };
  }
  function viewJoin(useRecovery) {
    useRecovery = useRecovery === true;
    show(head('다른 기기의 동기화 연결', '이 기기 데이터는 동기화 데이터로 바뀌어요') + `<div class="space-y-2">
      ${inp('sId', '동기화 ID', 'text', 'XXXX-XXXX-XXXX-XXXX', 'autocomplete="off" autocapitalize="characters"')}
      ${useRecovery ? inp('sRec', '복구 코드', 'text', 'XXXX-XXXX-…', 'autocomplete="off" autocapitalize="characters"') + inp('sNewPw', '새 비밀번호 (8자 이상)', 'password', '', 'autocomplete="new-password"') : inp('sPw', '비밀번호', 'password', '', 'autocomplete="current-password"')}
      ${err()}${btn('sGo', '연결하기')}
      <button type="button" id="sAlt" class="w-full text-xs font-bold text-slate-500 py-1">${useRecovery ? '비밀번호로 연결하기' : '비밀번호를 잊었어요 (복구 코드로 연결)'}</button></div>`);
    wire({ sAlt: () => viewJoin(!useRecovery), sGo: () => working('sGo', async () => {
      const id = clean(modal.querySelector('#sId').value);
      if (id.length !== 16) throw new Error('동기화 ID를 확인해 주세요 (16자리).');
      let c;
      if (useRecovery) {
        const rec = clean(modal.querySelector('#sRec').value), np = modal.querySelector('#sNewPw').value;
        if (rec.length !== 24) throw new Error('복구 코드를 확인해 주세요 (24자리).');
        if (np.length < 8) throw new Error('새 비밀번호는 8자 이상으로 해주세요.');
        c = await connect(id, rec, true, np);
      } else c = await connect(id, modal.querySelector('#sPw').value, false);
      viewConfirmJoin(c);
    }) });
  }
  function viewConfirmJoin(c) {
    show(head('이 기기 데이터를 바꿀까요?') + `<div class="space-y-3 text-sm text-slate-600">
      <p>동기화 데이터(${esc(c.device || '다른 기기')} · ${ago(c.at)} 저장)로 <b>이 기기의 가계부·주식·자산 데이터가 바뀌어요.</b></p>
      <p class="text-xs text-slate-500">지금 이 기기 데이터는 동기화 설정에서 한 번 되돌릴 수 있게 보관해 둬요.</p>
      ${btn('sYes', '바꾸고 연결하기')}${btn('sNo', '취소', 'bg-white border border-slate-200 text-slate-600')}</div>`);
    wire({ sNo: closeModal, sYes: () => { c.commit(); sessionStorage.setItem('argon_sync_toast', '☁️ 동기화에 연결했어요. 이제 이 기기도 자동으로 맞춰져요.'); location.reload(); } });
  }
  function viewOn() {
    const hasLocal = !!localStorage.getItem(LOCAL_BACKUP);
    show(head('☁️ 기기 동기화 <span class="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 align-middle">켜짐</span>') + `<div class="space-y-3">
      <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <p class="text-[11px] font-bold text-slate-500">동기화 ID</p>
        <div class="flex items-center gap-2 mt-1"><code class="flex-1 font-mono font-extrabold text-sm text-slate-900">${group(state.id)}</code><button type="button" id="sCopy" class="text-xs font-bold text-indigo-600 px-2 py-1 rounded-md bg-indigo-50">복사</button></div>
        <p id="syncStatusLine" class="text-[11px] text-slate-500 mt-2"></p>
      </div>
      ${btn('sNow', '지금 동기화')}
      <details class="text-xs"><summary class="font-bold text-slate-500 cursor-pointer py-1">되돌리기 · 끄기</summary>
        <div class="space-y-2 mt-2">
          ${btn('sPrev', '서버를 바로 전 버전으로 되돌리기', 'bg-white border border-slate-200 text-slate-700')}
          ${hasLocal ? btn('sLocal', '이 기기의 직전 데이터로 되돌리기', 'bg-white border border-slate-200 text-slate-700') : ''}
          ${btn('sOff', '이 기기에서 동기화 끄기', 'bg-white border border-slate-200 text-slate-700')}
          ${btn('sDel', '서버 데이터 삭제 (모든 기기 동기화 끝)', 'bg-white border border-rose-200 text-rose-600')}
          <p class="text-[10px] text-slate-400">끄거나 삭제해도 이 기기 데이터는 그대로 남아요.</p>
        </div></details>
      ${err()}</div>`);
    stamp();
    wire({
      sCopy: async () => { try { await navigator.clipboard.writeText(group(state.id)); modal.querySelector('#sCopy').textContent = '복사됨'; } catch (e) {} },
      sNow: () => working('sNow', async () => { if (state.dirtyAt) await push(false); await pull(true); stamp(); }),
      sPrev: () => working('sPrev', async () => {
        if (!confirm('서버 데이터를 바로 전 버전으로 되돌리고 이 기기에도 적용할까요?')) return;
        const blob = await api({ op: 'restore', id: state.id, token: state.token });
        apply(await open(unb64(state.dk), blob)); state = { ...state, rev: blob.rev, syncedAt: blob.updatedAt, dirtyAt: null }; saveState(state);
        sessionStorage.setItem('argon_sync_toast', '☁️ 서버를 바로 전 버전으로 되돌렸어요'); location.reload();
      }),
      sLocal: () => {
        if (!confirm('이 기기를 동기화로 덮어쓰기 직전 데이터로 되돌릴까요? (되돌린 내용이 서버에도 올라가요)')) return;
        const snap = JSON.parse(localStorage.getItem(LOCAL_BACKUP)); apply(snap);
        state.dirtyAt = Date.now(); saveState(state);
        sessionStorage.setItem('argon_sync_toast', '☁️ 이 기기의 직전 데이터로 되돌렸어요'); push(true).then(() => location.reload());
      },
      sOff: () => { if (!confirm('이 기기에서 동기화를 끌까요? 데이터는 그대로 남아요.')) return; state = null; saveState(null); closeModal(); badge(); toast('☁️ 이 기기에서 동기화를 껐어요'); },
      sDel: () => working('sDel', async () => {
        if (!confirm('서버에 저장된 동기화 데이터를 지울까요? 모든 기기에서 동기화가 끝나요. (각 기기의 데이터는 그대로)')) return;
        await api({ op: 'delete', id: state.id, token: state.token }); state = null; saveState(null); closeModal(); badge(); toast('☁️ 서버 데이터를 지웠어요');
      })
    });
  }

  function addNavButton() {
    const nav = document.getElementById('sideNav');
    if (!nav || document.getElementById('syncNavBtn')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'syncNavBtn'; b.className = 'w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100';
    b.addEventListener('click', openSync);
    let foot = nav.querySelector('.mt-auto');
    if (!foot) { foot = document.createElement('div'); foot.className = 'mt-auto pt-3 border-t border-slate-100'; nav.appendChild(foot); }
    foot.insertBefore(b, foot.firstChild);
    badge();
  }

  function start() {
    addNavButton();
    const t = sessionStorage.getItem('argon_sync_toast');
    if (t) { sessionStorage.removeItem('argon_sync_toast'); setTimeout(() => toast(esc(t), 6000), 400); }
    if (state && location.protocol !== 'file:') {
      pull(false);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') pull(false);
        else if (state && state.dirtyAt) push(false);
      });
      window.addEventListener('online', () => { if (state && state.dirtyAt) push(false); else pull(false); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.openSync = openSync;
  window.argonSync = { push, pull, get state() { return state; } };   // 테스트·디버그용
})();
