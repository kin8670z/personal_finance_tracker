// 든든: 여행 외국어 공부 (영어·일본어 공통) — 듣기 모드 · 카드 복습 · 공부 기록 · 내 문장
// 페이지에서 window.LANG = { key, name, flag, tts, voiceRe, voicePref, deck, item } 를 먼저 정한다.
(function () {
    // 언어별 설정은 페이지에서 window.LANG으로 (영어·일본어 공통 코드)
    const L = window.LANG, KEY = L.key;
    function load(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
    function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const isDark = () => document.documentElement.classList.contains('dark');
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = () => ymd(new Date());

    let st = Object.assign({ srs: {}, days: {}, custom: [], set: {} }, load(KEY, {}));
    st.set = Object.assign({ cat: 'all', order: 'seq', rate: 0.85, gap: 2, repeat: 2, koFirst: false, hide: false, voice: '' }, st.set);
    const persist = () => save(KEY, st);

    // 일본어: 히라가나 읽기 + 한글 발음 줄
    // 글자가 이미 히라가나뿐이면(すみません。) 읽기 줄은 생략하고 한글 발음만
    const readingHtml = (c, size) => c.r ? `${c.r !== String(c.en).replace(/[。、？！?!\s]/g, '') ? `<span class="block ${size} font-bold text-indigo-500 mt-1">${esc(c.r)}</span>` : ''}${c.p ? `<span class="block text-[11px] font-bold text-slate-400 mt-0.5">${esc(c.p)}</span>` : ''}` : '';
    // ---------- 카드 ----------
    function allCards() {
      const out = [];
      L.deck.forEach(c => c.items.forEach((x, i) => out.push(Object.assign({ id: `${c.id}:${i}`, cat: c.id }, L.item(x)))));
      st.custom.forEach((x, i) => out.push({ id: `my:${x.id || i}`, cat: 'my', en: x.en, ko: x.ko, mine: x.id }));
      return out;
    }
    const isDue = c => { const s = st.srs[c.id]; return s && s.due <= Date.now(); };
    const isWeak = c => { const s = st.srs[c.id]; return s && s.box <= 2; };
    function cardsOf(cat) {
      const a = allCards();
      if (cat === 'all') return a;
      if (cat === 'review') return a.filter(c => isDue(c) || isWeak(c));
      return a.filter(c => c.cat === cat);
    }
    function renderCats() {
      const counts = { review: cardsOf('review').length, my: st.custom.length };
      const cats = [['all', '전체'], ...L.deck.map(c => [c.id, c.name]), ['review', `🔁 복습 ${counts.review}`], ['my', `⭐ 내 문장 ${counts.my}`]];
      document.getElementById('cats').innerHTML = cats.map(([k, l]) => `<span role="button" tabindex="0" onclick="setCat('${k}')" class="cursor-pointer shrink-0 whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold border ${st.set.cat === k ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 bg-white'}" style="${st.set.cat === k ? 'background:#4f46e5' : ''}">${l}</span>`).join('');
    }
    function setCat(k) { st.set.cat = k; persist(); stop(); buildQueue(); qi = 0; renderAll(); }

    // ---------- 음성 (브라우저 내장 TTS) ----------
    let voices = [];
    function loadVoices() {
      voices = (window.speechSynthesis ? speechSynthesis.getVoices() : []);
      renderOpts();
    }
    const enVoices = () => voices.filter(v => L.voiceRe.test(v.lang));
    function voiceFor(lang) {
      if (lang === 'en') { const v = enVoices(); return v.find(x => x.name === st.set.voice) || v.find(x => L.voicePref.test(x.lang) && /google|samantha|kyoko|natural|siri|otoya/i.test(x.name)) || v.find(x => L.voicePref.test(x.lang)) || v[0]; }
      return voices.find(x => /^ko/i.test(x.lang));
    }
    function speak(text, lang, rate) {
      return new Promise(res => {
        if (!window.speechSynthesis) { res(); return; }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang === 'en' ? L.tts : 'ko-KR'; const v = voiceFor(lang); if (v) u.voice = v;
        u.rate = lang === 'en' ? (rate || st.set.rate) : 1.05;
        let done = false; const fin = () => { if (!done) { done = true; res(); } };
        u.onend = fin; u.onerror = fin;
        speechSynthesis.speak(u);
        setTimeout(fin, 15000 + text.length * 150);   // 일부 브라우저에서 onend가 안 올 때
      });
    }
    function sayEn(text) { if (!window.speechSynthesis) return; speechSynthesis.cancel(); speak(text, 'en'); mark(); }

    // ---------- 듣기 플레이어 ----------
    let queue = [], qi = 0, playing = false, token = 0, wake = null, revealed = false;
    function buildQueue() {
      queue = cardsOf(st.set.cat).slice();
      if (st.set.order === 'shuffle') for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; }
      if (qi >= queue.length) qi = 0;
    }
    const wait = (ms, t) => new Promise(r => setTimeout(() => r(t === token), ms));
    async function playCard(t) {
      const c = queue[qi]; if (!c) return false;
      showCard(c);
      const S = st.set, gap = S.gap * 1000;
      const say = async (lang, label) => { if (t !== token) return false; setPhase(label); await speak(lang === 'en' ? c.en : c.ko, lang); return t === token; };
      if (S.koFirst) {
        if (!await say('ko', '🇰🇷 뜻')) return false;
        setPhase(`💭 ${L.name}로 말해보세요`); if (!await wait(gap + 1500, t)) return false;
        revealed = true; showCard(c);
        for (let i = 0; i < S.repeat; i++) { if (!await say('en', `${L.flag} ${L.name}${S.repeat > 1 ? ` (${i + 1}/${S.repeat})` : ''}`)) return false; if (i < S.repeat - 1 && !await wait(gap, t)) return false; }
      } else {
        if (!await say('en', `${L.flag} ${L.name}`)) return false;
        if (!await wait(gap, t)) return false;
        revealed = true; showCard(c);
        if (!await say('ko', '🇰🇷 뜻')) return false;
        for (let i = 1; i < S.repeat; i++) { if (!await wait(gap, t)) return false; if (!await say('en', `${L.flag} 한 번 더${S.repeat > 2 ? ` (${i}/${S.repeat - 1})` : ''}`)) return false; }
      }
      mark();
      return await wait(gap * 1.5, t);
    }
    async function loop(t) {
      while (playing && t === token) {
        const ok = await playCard(t);
        if (!ok || t !== token) return;
        qi++; revealed = false;
        if (qi >= queue.length) { qi = 0; if (st.set.order === 'shuffle') buildQueue(); }
      }
    }
    async function togglePlay() {
      if (!window.speechSynthesis) { warn('이 브라우저는 음성 읽기를 지원하지 않아요.'); return; }
      if (playing) { stop(); return; }
      if (!queue.length) { warn('이 목록에 문장이 없어요.'); return; }
      playing = true; token++; revealed = false;
      document.getElementById('playBtn').textContent = '⏸';
      try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) {}
      if (!enVoices().length) warn(`${L.name} 음성이 없어 기본 음성으로 읽어요. 폰 설정 > 텍스트 음성 변환(또는 접근성 > 음성 콘텐츠)에서 ${L.name} 음성을 받으면 더 자연스러워요.`);
      loop(token);
    }
    function stop() {
      playing = false; token++;
      if (window.speechSynthesis) speechSynthesis.cancel();
      document.getElementById('playBtn').textContent = '▶'; setPhase('');
      if (wake) { wake.release().catch(() => {}); wake = null; }
    }
    function step(d) {
      const was = playing; stop();
      qi = (qi + d + queue.length) % Math.max(queue.length, 1); revealed = false; showCard(queue[qi]);
      if (was) togglePlay();
    }
    document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && playing && !wake && 'wakeLock' in navigator) { try { wake = await navigator.wakeLock.request('screen'); } catch (e) {} } });
    function peek() { revealed = true; showCard(queue[qi]); }
    function setPhase(t) { document.getElementById('phase').textContent = t; }
    function warn(t) { const w = document.getElementById('ttsWarn'); w.textContent = t; w.classList.remove('hidden'); }
    function showCard(c) {
      document.getElementById('pos').textContent = queue.length ? `${qi + 1} / ${queue.length}` : '';
      if (!c) { document.getElementById('enText').textContent = '문장이 없어요'; document.getElementById('koText').textContent = ''; return; }
      const hideEn = st.set.koFirst && !revealed, hideKo = !st.set.koFirst && st.set.hide && !revealed;
      document.getElementById('enText').innerHTML = hideEn ? '<span class="text-slate-300">· · ·</span>' : `<span>${esc(c.en)}${readingHtml(c, 'text-sm')}</span>`;
      document.getElementById('koText').innerHTML = hideKo ? '<span class="text-slate-300">(누르면 뜻 보기)</span>' : esc(c.ko);
    }
    function renderOpts() {
      const S = st.set;
      const seg = (key, list) => `<span class="seg inline-flex bg-slate-100 rounded-lg p-0.5">${list.map(([v, l]) => `<span role="button" tabindex="0" onclick="setOpt('${key}', ${JSON.stringify(v).replace(/"/g, '&quot;')})" class="cursor-pointer px-2 py-0.5 rounded-md whitespace-nowrap ${S[key] === v ? 'bg-indigo-600 text-white' : ''}">${l}</span>`).join('')}</span>`;
      const ev = enVoices();
      document.getElementById('opts').innerHTML = `
        <div class="flex items-center gap-2 flex-wrap"><span class="w-14 shrink-0">속도</span>${seg('rate', [[0.7, '천천히'], [0.85, '보통'], [1, '원어민']])}</div>
        <div class="flex items-center gap-2 flex-wrap"><span class="w-14 shrink-0">쉬는 시간</span>${seg('gap', [[1, '1초'], [2, '2초'], [3, '3초'], [5, '5초']])}</div>
        <div class="flex items-center gap-2 flex-wrap"><span class="w-14 shrink-0">${L.name} 횟수</span>${seg('repeat', [[1, '1번'], [2, '2번'], [3, '3번']])}</div>
        <div class="flex items-center gap-2 flex-wrap"><span class="w-14 shrink-0">순서</span>${seg('order', [['seq', '순서대로'], ['shuffle', '섞기']])}</div>
        <div class="flex items-center gap-2 flex-wrap"><span class="w-14 shrink-0">방식</span>${seg('koFirst', [[false, `${L.name} → 뜻`], [true, `뜻 → ${L.name} 말하기`]])}</div>
        <div class="flex items-center gap-2 flex-wrap"><span class="w-14 shrink-0">화면</span>${seg('hide', [[false, '뜻 보기'], [true, '뜻 가리기']])}</div>
        ${ev.length > 1 ? `<div class="flex items-center gap-2"><span class="w-14 shrink-0">목소리</span><select onchange="setOpt('voice', this.value)" class="flex-1 min-w-0 border border-slate-200 rounded-lg px-2 py-1 bg-white" style="font-size:12px!important"><option value="">자동</option>${ev.map(v => `<option value="${esc(v.name)}" ${S.voice === v.name ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select></div>` : ''}`;
    }
    function setOpt(k, v) {
      st.set[k] = v; persist(); renderOpts();
      if (k === 'order') { const cur = queue[qi]; buildQueue(); if (cur) qi = Math.max(0, queue.findIndex(c => c.id === cur.id)); }
      if (k === 'hide' || k === 'koFirst') { revealed = false; showCard(queue[qi]); }
    }

    // ---------- 공부 기록 ----------
    function mark() { const d = today(); st.days[d] = (st.days[d] || 0) + 1; persist(); renderStats(); }
    function streak() { let n = 0; const d = new Date(); if (!st.days[ymd(d)]) d.setDate(d.getDate() - 1); while (st.days[ymd(d)]) { n++; d.setDate(d.getDate() - 1); } return n; }
    function renderStats() {
      const s = streak(), todayN = st.days[today()] || 0;
      const known = allCards().filter(c => (st.srs[c.id] || {}).box >= 4).length, total = allCards().length;
      document.getElementById('streakLine').textContent = s ? `🔥 ${s}일 연속 · 오늘 ${todayN}문장` : todayN ? `오늘 ${todayN}문장` : '오늘 첫 문장을 들어볼까요?';
      // 최근 12주 잔디 (월요일 시작)
      const end = new Date(); end.setHours(0, 0, 0, 0); const start = new Date(end); start.setDate(start.getDate() - 7 * 11 - ((end.getDay() + 6) % 7));
      const cells = []; for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) { const n = st.days[ymd(d)] || 0; cells.push(`<span title="${ymd(d)} ${n}문장" class="w-3.5 h-3.5 rounded-sm" style="background:${n === 0 ? (isDark() ? '#334155' : '#e2e8f0') : n < 10 ? '#a7f3d0' : n < 30 ? '#34d399' : '#059669'}"></span>`); }
      document.getElementById('stats').innerHTML = `<div class="grid grid-cols-3 gap-2 mb-3">
          <div class="bg-slate-50 rounded-lg px-2 py-2 text-center"><p class="text-[10px] font-bold text-slate-400">연속</p><p class="text-sm font-extrabold num text-slate-800">${s}일</p></div>
          <div class="bg-slate-50 rounded-lg px-2 py-2 text-center"><p class="text-[10px] font-bold text-slate-400">오늘</p><p class="text-sm font-extrabold num text-slate-800">${todayN}문장</p></div>
          <div class="bg-slate-50 rounded-lg px-2 py-2 text-center"><p class="text-[10px] font-bold text-slate-400">외운 문장</p><p class="text-sm font-extrabold num text-emerald-600">${known}/${total}</p></div>
        </div>
        <div class="grid grid-flow-col gap-1 justify-start" style="grid-template-rows:repeat(7,auto)">${cells.join('')}</div>
        <p class="text-[10px] text-slate-400 mt-1.5">최근 12주 · 듣거나 카드로 본 문장 수 · '외운 문장'은 카드에서 알아요를 여러 번 누른 것</p>`;
    }

    // ---------- 카드 복습 (간단한 라이트너 상자: 알아요를 누를수록 늦게 다시 나옴) ----------
    const GAP_DAYS = [0, 1, 2, 4, 8, 16];
    let cardQ = [], ci = 0, flipped = false;
    function buildCardQ() {
      const base = cardsOf(st.set.cat), now = Date.now();
      const due = base.filter(c => isDue(c)), fresh = base.filter(c => !st.srs[c.id]);
      cardQ = [...due.sort((a, b) => st.srs[a.id].due - st.srs[b.id].due), ...fresh].slice(0, 20);
      ci = 0; flipped = false;
      document.getElementById('dueInfo').textContent = `복습 ${due.length} · 새 문장 ${fresh.length}`;
    }
    function renderCard() {
      const box = document.getElementById('card'), c = cardQ[ci];
      if (!c) { box.innerHTML = `<div class="text-center py-6"><p class="text-3xl">🎉</p><p class="text-sm font-extrabold text-slate-800 mt-1">오늘 볼 카드는 다 봤어요!</p><p class="text-[11px] text-slate-400 mt-1">모르는 문장은 내일 다시 나와요</p><span role="button" tabindex="0" onclick="buildCardQ(); renderCard()" class="cursor-pointer inline-block mt-3 text-xs font-bold text-indigo-600">처음부터 다시</span></div>`; return; }
      const front = st.set.koFirst ? esc(c.ko) : esc(c.en) + readingHtml(c, 'text-xs'), back = st.set.koFirst ? esc(c.en) + readingHtml(c, 'text-xs') : esc(c.ko);
      box.innerHTML = `<div role="button" tabindex="0" onclick="flip()" class="cursor-pointer rounded-2xl border-2 border-dashed ${flipped ? 'border-emerald-300' : 'border-indigo-200'} px-4 py-6 text-center select-none">
          <p class="text-[10px] font-bold text-slate-400 mb-1">${ci + 1} / ${cardQ.length}${st.srs[c.id] ? ` · ${st.srs[c.id].box}단계` : ' · 새 문장'}</p>
          <p class="text-lg font-extrabold text-slate-900">${front}</p>
          <p class="text-sm font-bold mt-2 ${flipped ? 'text-emerald-600' : 'text-slate-300'}">${flipped ? back : '눌러서 확인'}</p>
        </div>
        <div class="flex gap-2 mt-2">
          <span role="button" tabindex="0" onclick="sayEn(${JSON.stringify(c.en).replace(/"/g, '&quot;')})" class="cursor-pointer px-3 py-2 rounded-xl bg-slate-100 text-sm" aria-label="듣기">🔊</span>
          <span role="button" tabindex="0" onclick="grade(0)" class="cursor-pointer flex-1 py-2 text-center rounded-xl bg-rose-50 text-rose-600 font-bold text-sm">몰라요</span>
          <span role="button" tabindex="0" onclick="grade(1)" class="cursor-pointer flex-1 py-2 text-center rounded-xl bg-amber-50 text-amber-700 font-bold text-sm">애매해요</span>
          <span role="button" tabindex="0" onclick="grade(2)" class="cursor-pointer flex-1 py-2 text-center rounded-xl bg-emerald-50 text-emerald-700 font-bold text-sm">알아요</span>
        </div>`;
    }
    function flip() { flipped = !flipped; renderCard(); if (flipped && !st.set.koFirst) {} }
    function grade(g) {
      const c = cardQ[ci]; if (!c) return;
      const s = st.srs[c.id] || { box: 0 };
      s.box = g === 0 ? 1 : g === 1 ? Math.max(1, s.box) : Math.min(5, s.box + 1);
      s.due = g === 0 ? Date.now() + 10 * 60000 : Date.now() + GAP_DAYS[s.box] * 864e5;
      st.srs[c.id] = s; persist(); mark();
      if (g === 0) cardQ.push(c);   // 모르면 이번에 한 번 더
      ci++; flipped = false; renderCard(); renderCats();
    }

    // ---------- 목록 / 내 문장 ----------
    let listOpen = false;
    function toggleList() { listOpen = !listOpen; document.getElementById('list').classList.toggle('hidden', !listOpen); document.getElementById('listArrow').textContent = listOpen ? '접기 ▴' : '펼치기 ▾'; renderList(); }
    function renderList() {
      const list = cardsOf(st.set.cat);
      document.getElementById('listCount').textContent = `${list.length}개`;
      if (!listOpen) return;
      document.getElementById('list').innerHTML = list.length ? `<div class="divide-y divide-slate-100">${list.map(c => `<div class="flex items-center gap-2 py-1.5">
          <span role="button" tabindex="0" onclick="sayEn(${JSON.stringify(c.en).replace(/"/g, '&quot;')})" class="cursor-pointer text-sm shrink-0" aria-label="듣기">🔊</span>
          <span class="min-w-0 flex-1"><span class="block text-xs font-bold text-slate-800">${esc(c.en)}</span>${c.r ? `<span class="block text-[10px] text-indigo-500">${esc(c.r)} · ${esc(c.p || '')}</span>` : ''}<span class="block text-[11px] text-slate-500">${esc(c.ko)}</span></span>
          ${(st.srs[c.id] || {}).box >= 4 ? '<span class="text-[10px] font-bold text-emerald-600 shrink-0">외움</span>' : ''}
          ${c.mine ? `<span role="button" tabindex="0" onclick="delMine(${c.mine})" class="cursor-pointer text-[11px] text-slate-300 shrink-0" aria-label="삭제">✕</span>` : ''}
        </div>`).join('')}</div>` : `<p class="text-xs text-slate-400">문장이 없어요.</p>`;
    }
    function delMine(id) { st.custom = st.custom.filter(x => x.id !== id); persist(); buildQueue(); renderAll(); }
    document.getElementById('addForm').addEventListener('submit', e => {
      e.preventDefault();
      const en = document.getElementById('addEn').value.trim(), ko = document.getElementById('addKo').value.trim();
      if (!en) return;
      st.custom.push({ id: Math.max(Date.now(), ...st.custom.map(x => (x.id || 0) + 1)), en, ko });
      document.getElementById('addEn').value = ''; document.getElementById('addKo').value = '';
      persist(); buildQueue(); renderAll();
    });

    function renderAll() { renderCats(); showCard(queue[qi]); renderOpts(); buildCardQ(); renderCard(); renderStats(); renderList(); }

    function openSideNav() { document.getElementById('sideNav').classList.add('open'); document.getElementById('sideNavBackdrop').classList.add('open'); }
    function closeSideNav() { document.getElementById('sideNav').classList.remove('open'); document.getElementById('sideNavBackdrop').classList.remove('open'); }
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSideNav(); });
    function toggleDark() {
      const on = !isDark(); document.documentElement.classList.toggle('dark', on);
      try { localStorage.setItem('argon_dark_mode', String(on)); } catch (e) {}
      document.getElementById('darkBtn').textContent = on ? '☀️ 라이트 모드' : '🌙 다크 모드';
      renderStats();
    }
    document.getElementById('darkBtn').textContent = isDark() ? '☀️ 라이트 모드' : '🌙 다크 모드';
    if (!window.speechSynthesis) warn('이 브라우저는 음성 읽기를 지원하지 않아요. (카드 복습은 쓸 수 있어요)');
    // 오늘 화면 '오늘의 문장'에서 넘어오면 그 문장부터
    buildQueue();
    const want = new URLSearchParams(location.search).get('card');
    if (want) { const i = queue.findIndex(c => c.id === want); if (i < 0) { st.set.cat = 'all'; buildQueue(); } qi = Math.max(0, queue.findIndex(c => c.id === want)); }
    renderAll();
    if (window.speechSynthesis) { speechSynthesis.onvoiceschanged = loadVoices; loadVoices(); }

  Object.assign(window, { setCat, togglePlay, step, peek, setOpt, sayEn, flip, grade, buildCardQ, renderCard, toggleList, delMine, openSideNav, closeSideNav, toggleDark });
})();
