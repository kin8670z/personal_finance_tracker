// 든든: 출퇴근 경로 (오늘 화면 · 지하철 화면 공통)
// 저장: argon_commute_v1 = { stops: ['하남검단산', '군자', '이수', '정부과천청사'], transfer: 4(분), walk: 0(분) } · 퇴근은 거꾸로
// 필요: tt.js (window.ArgonTT)
(function () {
  const KEY = 'argon_commute_v1', PINS = 'argon_commute_pins_v1';   // PINS = { go: [{ dep: 분, dest }], back: [...] } 최대 3개씩
  const getPins = mode => (load(PINS, {})[mode] || []);
  const findPin = (trains, p) => trains.filter(t => t.dest === p.dest && Math.abs(t.dep - p.dep) <= 3).sort((a, b) => Math.abs(a.dep - p.dep) - Math.abs(b.dep - p.dep))[0];
  const T = () => window.ArgonTT;
  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const label = n => n === '서울' ? '서울역' : n + '역';
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const cleanSt = n => { n = String(n || '').trim().replace(/\s*\(.*\)$/, '').replace(/\s+/g, ''); return n === '서울역' ? '서울' : n.replace(/역$/, ''); };
  const hhmm = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const mm2t = m => { m = Math.round(m); return `${pad(Math.floor(m / 60) % 24)}:${pad(((m % 60) + 60) % 60)}`; };   // 운행일 분 → 'HH:MM'
  // 오늘 운행일 0시 기준 분 → 실제 시각(ms). 새벽 4시 전은 전날 밤 운행
  function msOfMins(mins) { const d = new Date(), base = new Date(d.getFullYear(), d.getMonth(), d.getDate()); if (d.getHours() < 4) base.setDate(base.getDate() - 1); return base.getTime() + mins * 60000; }

  // 구간 A→B를 실제로 가는 열차: 같은 열차번호가 A 다음에 B를 지나는 것 (B가 종점이어도 됨)
  function segTrains(tA, tB) {
    const atB = {}; (tB.allLines || tB.lines || []).forEach(L => L.dirs.forEach(D => D.trains.forEach(x => { if (x[3]) atB[T().normNo(x[3])] = x[0]; })));
    const out = [];
    (tA.lines || []).forEach(L => L.dirs.forEach(D => D.trains.forEach(x => {
      const b = atB[T().normNo(x[3])]; if (!b) return;
      const dep = T().minsOf(x[0]), arr = T().minsOf(b);
      if (arr > dep && arr - dep < 150) out.push({ no: T().normNo(x[3]), dep, arr, line: L.line, dest: x[1] });
    })));
    return out.sort((a, b) => a.dep - b.dep);
  }
  // 첫 열차를 타면 → 환승 → 도착 (delay: 첫 열차 지연 분, 환승역 도착까지 그대로 간다고 가정)
  function chain(segs, first, delayMin, transfer) {
    let arr = first.arr + delayMin; const legs = [{ ...first, dep: first.dep + delayMin, arr }];
    for (let i = 1; i < segs.length; i++) {
      const nx = segs[i].trains.find(t => t.dep >= arr + transfer);
      if (!nx) return { legs, end: null };
      legs.push(nx); arr = nx.arr;
    }
    return { legs, end: arr };
  }
  async function plan(mode, week) {
    const c = load(KEY, null); if (!c || !c.stops || c.stops.length < 2) return null;
    const stops = mode === 'go' ? c.stops : c.stops.slice().reverse();
    const tts = await Promise.all(stops.map(s => T().load(s, week)));
    const segs = stops.slice(1).map((s, i) => ({ from: stops[i], to: s, trains: segTrains(tts[i], tts[i + 1]) }));
    return { c, stops, segs };
  }

  // ---------- 화면 ----------
  // variant 'today': 지금 기준 3개 (실시간) · 'subway': 시각·기준·요일을 골라서
  const S = { box: null, variant: 'today', mode: null, edit: false, rt: null, rtAt: 0, time: null, basis: 'dep', week: null, onChange: null };
  const autoMode = () => new Date().getHours() < 14 ? 'go' : 'back';
  const chip = (on, color, text, click) => `<span role="button" tabindex="0" onclick="${click}" aria-pressed="${on}" class="cursor-pointer text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${on ? 'border-transparent text-white' : 'border-slate-200 text-slate-400 opacity-70'}" style="${on ? `background:${color}` : ''}">${text}</span>`;

  async function realtimeFirst(stops, seg0) {
    const now = Date.now(), byNo = {}; seg0.trains.forEach(t => byNo[t.no] = t);
    try {
      if (!S.rt || S.rt.station !== stops[0] || now - S.rtAt > 25000) {
        const r = await fetch(`./api/subway?station=${encodeURIComponent(stops[0])}`); const j = await r.json();
        S.rt = { station: stops[0], arrivals: r.ok && !j.needKey ? (j.arrivals || []) : [] }; S.rtAt = Date.now();
      }
      return S.rt.arrivals.filter(a => byNo[T().normNo(a.no)] && String(a.code) !== '2').map(a => {
        const t = byNo[T().normNo(a.no)], sched = msOfMins(t.dep);
        let eta = S.rtAt + 1000 * (a.sec > 0 ? a.sec : a.est != null ? a.est : 0);
        if (!(a.sec > 0)) eta = Math.max(eta, sched);   // 위치로 추정한 건 시간표보다 이르지 않게
        return { t, eta, live: true, delay: Math.max(0, Math.round((eta - sched) / 60000)) };
      }).sort((x, y) => x.eta - y.eta);
    } catch (e) { return []; }
  }

  function card(o, ch, stops, segs, extra) {
    const endTxt = ch.end != null ? T().disp(mm2t(ch.end)) : '-';
    const legs = ch.legs.slice(1).map((l, k) => `<span class="whitespace-nowrap">${esc(label(segs[k + 1].from))} ${T().disp(mm2t(l.dep))} ${esc(l.line)} 환승</span>`).join(' · ');
    return `<div class="rounded-xl px-3 py-2.5 ${extra.hl ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-slate-50'} ${extra.dim ? 'opacity-50' : ''}">
        <div class="flex items-center justify-between gap-2">
          <span class="min-w-0 flex items-center gap-2">${extra.pin ? `<span role="button" tabindex="0" onclick="Commute.pin(${extra.pin.dep}, '${esc(extra.pin.dest)}')" aria-label="오늘 화면에 고정" aria-pressed="${extra.pin.on}" class="cursor-pointer text-lg leading-none shrink-0 ${extra.pin.on ? '' : 'opacity-30 grayscale'}">📌</span>` : ''}<span class="min-w-0">${extra.left}<span class="block text-[10px] font-bold text-slate-500 truncate">${extra.sub}</span></span></span>
          <span class="text-right shrink-0"><span class="block text-[10px] font-bold text-slate-400">${esc(label(stops[stops.length - 1]))} 도착</span><span class="block text-base font-extrabold num text-indigo-600">${endTxt}</span>${ch.end != null ? `<span class="block text-[10px] font-bold text-slate-400">${Math.round(ch.end - extra.start)}분</span>` : ''}</span>
        </div>
        ${legs ? `<p class="text-[10px] text-slate-500 mt-1">🔁 ${legs}</p>` : ''}
        ${ch.end == null ? `<p class="text-[10px] text-rose-600 mt-1">환승할 열차가 끊겼어요</p>` : ''}
        ${extra.note || ''}
      </div>`;
  }

  async function render() {
    const box = S.box; if (!box || S.edit) return;
    const mode = S.mode || autoMode(), sub = S.variant === 'subway';
    const week = (sub && S.week) || T().dayType();
    let p;
    try { p = await plan(mode, week); } catch (e) { if (S.edit) return; box.innerHTML = `<p class="text-xs text-rose-600">시간표를 못 불러왔어요: ${esc(e.message)}</p>`; return; }
    if (S.edit) return;
    if (!p) {
      box.innerHTML = `<div class="flex items-center justify-between mb-1"><h2 class="text-sm md:text-base font-extrabold text-slate-900">🧭 출퇴근 경로</h2></div>
        <p class="text-xs text-slate-500">출발·환승·도착역을 등록하면 출근·퇴근 방향 열차와 도착 시각을 바로 보여줘요.</p>
        <span role="button" tabindex="0" onclick="Commute.editor(true)" class="cursor-pointer inline-block mt-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold">🧭 경로 등록하기</span>`;
      return;
    }
    const { c, stops, segs } = p, walk = Number(c.walk) || 0, transfer = Number(c.transfer) || 4;
    const bad = segs.find(s => !s.trains.length);
    const head = `<div class="flex items-center justify-between gap-2 mb-1"><h2 class="text-sm md:text-base font-extrabold text-slate-900">🚇 ${mode === 'go' ? '출근' : '퇴근'}</h2>
        <span class="flex items-center gap-1">${chip(mode === 'go', '#f59e0b', '🌅 출근', "Commute.setMode('go')")}${chip(mode === 'back', '#4f46e5', '🌙 퇴근', "Commute.setMode('back')")}<span role="button" tabindex="0" onclick="Commute.editor(true)" aria-label="경로 설정" class="cursor-pointer text-sm px-1">⚙️</span></span></div>
      <div class="flex items-center justify-between gap-2 mb-2"><p class="text-[11px] font-bold min-w-0">${stops.map((s, i) => `<span class="${i === 0 || i === stops.length - 1 ? 'text-slate-900' : 'text-slate-500'}">${esc(label(s))}</span>`).join(' <span class="text-slate-300">→</span> ')}</p>${sub ? '' : `<a href="./subway.html" class="text-[11px] font-bold text-indigo-600 shrink-0">지하철 →</a>`}</div>`;
    // 지하철 화면: 시각·기준·요일 고르기
    const nowSel = S.time == null;
    const controls = sub ? `<div class="flex flex-wrap items-center gap-1.5 mb-2">
        <span class="seg flex bg-slate-100 rounded-lg p-0.5 text-[11px] font-bold">${[['dep', '출발'], ['arr', '도착']].map(([k, l]) => `<span role="button" tabindex="0" onclick="Commute.setBasis('${k}')" class="cursor-pointer px-2 py-0.5 rounded-md ${S.basis === k ? 'bg-indigo-600 text-white' : 'text-slate-500'}">${l} 기준</span>`).join('')}</span>
        <input type="time" id="cmTime" value="${nowSel ? mm2t(T().nowMins()) : mm2t(S.time)}" onchange="Commute.setTime(this.value)" class="border border-slate-200 rounded-lg px-2 py-0.5 bg-white text-sm num" style="font-size:14px!important">
        <span role="button" tabindex="0" onclick="Commute.setTime(null)" class="cursor-pointer px-2 py-0.5 rounded-lg text-[11px] font-bold ${nowSel ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}">지금</span>
        <span class="seg flex bg-slate-100 rounded-lg p-0.5 text-[11px] font-bold ml-auto">${['1', '2', '3'].map(w => `<span role="button" tabindex="0" onclick="Commute.setWeek('${w}')" class="cursor-pointer px-1.5 py-0.5 rounded-md ${week === w ? 'bg-slate-700 text-white' : 'text-slate-500'}">${T().WEEK[w]}</span>`).join('')}</span>
      </div>` : '';
    let body;
    if (bad) body = `<p class="text-xs text-rose-600">${esc(label(bad.from))} → ${esc(label(bad.to))} 바로 가는 열차를 시간표에서 못 찾았어요. ⚙️에서 환승역이나 역 이름을 확인해 주세요.</p>`;
    else if (sub && !nowSel) body = timeBody(stops, segs, walk, transfer);
    else if (sub && S.basis === 'arr') body = timeBody(stops, segs, walk, transfer, T().nowMins());
    else body = await nowBody(stops, segs, walk, transfer, sub ? 5 : 3, sub && week !== T().dayType());
    if (S.edit || S.box !== box) return;   // 그리는 사이 설정을 열었으면 덮어쓰지 않음
    let pinBar = '';
    if (sub) {
      const ps = getPins(mode).slice().sort((a, b) => a.dep - b.dep);
      pinBar = `<div class="flex flex-wrap items-center gap-1.5 mb-2 text-[11px] font-bold"><span class="text-slate-500">📌 오늘 화면에 보일 열차 ${ps.length}/3</span>${ps.map(p => `<span class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700"><span class="num">${T().disp(mm2t(p.dep))}</span> ${esc(p.dest)}행<span role="button" tabindex="0" onclick="Commute.pin(${p.dep}, '${esc(p.dest)}')" aria-label="고정 해제" class="cursor-pointer text-indigo-300 pl-0.5">✕</span></span>`).join('')}${ps.length ? '' : '<span class="text-slate-400 font-normal">아래 열차의 📌을 누르면 고정돼요</span>'}${S.pinMsg ? `<span class="text-rose-600">${esc(S.pinMsg)}</span>` : ''}</div>`;
      S.pinMsg = '';
    }
    box.innerHTML = head + controls + pinBar + body;
    tick();
  }

  // 지금 기준: 첫 열차는 실시간 (지연 반영), 나머지는 시간표
  async function nowBody(stops, segs, walk, transfer, n, otherDay) {
    const now = Date.now(), seg0 = segs[0];
    const rt = otherDay ? [] : await realtimeFirst(stops, seg0);
    const seen = new Set(rt.map(x => x.t.no)), lastEta = rt.length ? rt[rt.length - 1].eta : now;
    const sched = seg0.trains.filter(t => !seen.has(t.no) && msOfMins(t.dep) >= Math.max(now - 30000, lastEta)).slice(0, n).map(t => ({ t, eta: msOfMins(t.dep), live: false, delay: 0 }));
    const mode = S.mode || autoMode(), pins = getPins(mode), isPin = t => pins.some(p => findPin([t], p));
    if (S.variant === 'today' && pins.length) {
      // 고정한 열차들: 오늘 시간표에서 찾아서 실시간 지연까지
      const rtBy = {}; rt.forEach(x => rtBy[x.t.no] = x);
      const rows = pins.map(p => findPin(seg0.trains, p)).filter(Boolean).sort((a, b) => a.dep - b.dep).map(t => rtBy[t.no] || { t, eta: msOfMins(t.dep), live: false, delay: 0 });
      if (rows.length && rows.some(o => (o.eta - now) / 60000 >= -0.5)) {
        const nextIdx = rows.findIndex(o => (o.eta - now) / 60000 >= walk);
        return `<div class="space-y-2">${rows.map((o, i) => {
          const ch = chain(segs, o.t, o.delay, transfer), leftMin = (o.eta - now) / 60000, gone = leftMin < -0.5;
          return card(o, ch, stops, segs, {
            start: o.t.dep + o.delay, hl: i === nextIdx, dim: gone || (walk && leftMin < walk && i !== nextIdx),
            left: gone ? `<span class="block text-base font-extrabold num text-slate-400">${hhmm(o.eta)} 지나감</span>` : `<span class="block text-base font-extrabold num cm-tick ${leftMin <= 2 ? 'text-rose-600' : 'text-slate-900'}" data-eta="${o.eta}">-</span>`,
            sub: `📌 ${hhmm(o.eta)} ${esc(o.t.dest)}행 · ${o.live ? (o.delay >= 2 ? `<span class="text-rose-600">${o.delay}분 늦음</span>` : '실시간') : '시간표'}`,
            note: i === nextIdx && walk ? `<p class="text-[10px] font-bold text-emerald-700 mt-1">🏃 지금 나가면 이 열차 탈 수 있어요 (역까지 ${walk}분)</p>` : ''
          });
        }).join('')}</div>`;
      }
    }
    let opts = [...rt, ...sched].slice(0, n);
    if (!opts.length) return `<p class="text-xs text-slate-500">오늘 이 방향 열차는 끝났어요 🌙</p>`;
    // 오늘 화면: 지금 탈 수 있는 열차 1대만 (역까지 걷는 시간 반영)
    if (S.variant === 'today') { const ok = opts.find(o => (o.eta - now) / 60000 >= walk); opts = [ok || opts[opts.length - 1]]; }
    return `<div class="space-y-2">${opts.map((o, i) => {
        const ch = chain(segs, o.t, o.delay, transfer), leftMin = (o.eta - now) / 60000;
        const catchable = leftMin >= walk, firstCatch = catchable && opts.slice(0, i).every(p => (p.eta - now) / 60000 < walk);
        return card(o, ch, stops, segs, {
          start: o.t.dep + o.delay, hl: firstCatch && walk, dim: !catchable && walk,
          left: `<span class="block text-base font-extrabold num cm-tick ${leftMin <= 2 ? 'text-rose-600' : 'text-slate-900'}" data-eta="${o.eta}">-</span>`,
          sub: `${hhmm(o.eta)} ${esc(o.t.dest)}행 · ${o.live ? (o.delay >= 2 ? `<span class="text-rose-600">${o.delay}분 늦음</span>` : '실시간') : '시간표'}`,
          note: firstCatch && walk ? `<p class="text-[10px] font-bold text-emerald-700 mt-1">🏃 지금 나가면 이 열차 탈 수 있어요 (역까지 ${walk}분)</p>` : '',
          pin: S.variant === 'subway' ? { dep: o.t.dep, dest: o.t.dest, on: isPin(o.t) } : null
        });
      }).join('')}</div>
      ${S.variant === 'today' ? '' : `<p class="text-[9px] text-slate-400 mt-1.5">첫 열차는 실시간, 환승 이후는 시간표 기준 (환승 ${transfer}분) · 지연은 도착까지 그대로 간다고 가정</p>`}`;
  }

  // 고른 시각 기준 (시간표만): 출발 기준 = 그 시각 이후 열차 5대 · 도착 기준 = 그 시각까지 도착하는 마지막 3대
  function timeBody(stops, segs, walk, transfer, atOverride) {
    const at = atOverride != null ? atOverride : S.time, seg0 = segs[0];
    let rows;
    if (S.basis === 'dep') {
      // 역까지 걷는 시간을 더한 뒤 탈 수 있는 열차부터
      rows = seg0.trains.filter(t => t.dep >= at + walk).slice(0, 5).map(t => ({ t, ch: chain(segs, t, 0, transfer) }));
    } else {
      rows = seg0.trains.filter(t => t.dep <= at && t.dep >= at - 300).map(t => ({ t, ch: chain(segs, t, 0, transfer) })).filter(r => r.ch.end != null && r.ch.end <= at);
      // 같은 도착 시각이면 가장 늦게 출발하는 열차만
      const byEnd = {}; rows.forEach(r => { if (!byEnd[r.ch.end] || byEnd[r.ch.end].t.dep < r.t.dep) byEnd[r.ch.end] = r; });
      rows = Object.values(byEnd).sort((a, b) => a.t.dep - b.t.dep).slice(-3);
    }
    if (!rows.length) return `<p class="text-xs text-slate-500">${S.basis === 'dep' ? '그 시각 이후 열차가 없어요 🌙' : '그 시각까지 도착하는 열차가 없어요. 시각을 늦춰 보세요.'}</p>`;
    const lastIdx = rows.length - 1;
    const from = (S.mode || autoMode()) === 'go' ? '집에서' : '회사에서';   // 퇴근이면 회사에서 출발
    return `<div class="space-y-2">${rows.map((r, i) => {
        const hl = S.basis === 'arr' ? i === lastIdx : i === 0;
        const leave = r.t.dep - walk;
        return card(null, r.ch, stops, segs, {
          start: r.t.dep, hl,
          left: `<span class="block text-base font-extrabold num text-slate-900">${T().disp(mm2t(r.t.dep))} 출발</span>`,
          sub: `${esc(r.t.dest)}행 · ${esc(r.t.line)}${walk ? ` · ${from} ${T().disp(mm2t(leave))}` : ''}`,
          pin: { dep: r.t.dep, dest: r.t.dest, on: getPins(S.mode || autoMode()).some(p => findPin([r.t], p)) },
          note: hl ? `<p class="text-[10px] font-bold text-emerald-700 mt-1">${S.basis === 'arr' ? `⏰ 늦어도 이 열차${walk ? ` (${from} ${T().disp(mm2t(leave))}에 나가기)` : ''}` : `👍 ${walk ? `역까지 ${walk}분 걸으면 ` : ''}처음 탈 수 있는 열차`}</p>` : ''
        });
      }).join('')}</div>
      <p class="text-[9px] text-slate-400 mt-1.5">${T().WEEK[(S.week || T().dayType())]} 시간표 기준 · 환승 ${transfer}분${walk ? ` · 역까지 ${walk}분` : ''} · 실제로는 지연될 수 있어요</p>`;
  }

  function tick() {
    if (!S.box) return;
    S.box.querySelectorAll('.cm-tick').forEach(el => {
      const left = Math.round((Number(el.dataset.eta) - Date.now()) / 1000);
      el.textContent = left <= 30 ? '곧 출발' : left >= 3600 ? `${Math.floor(left / 3600)}시간 ${Math.floor(left % 3600 / 60)}분 후` : `${Math.floor(left / 60)}분 ${pad(left % 60)}초 후`;
    });
  }
  setInterval(tick, 1000);

  // ---------- 경로 설정 ----------
  function fixName(n) {
    let st = []; try { st = (JSON.parse(localStorage.getItem('subway_stations_cache_v1')) || {}).s || []; } catch (e) {}
    const names = [...new Set(st.map(x => cleanSt(x[0])))];
    if (!names.length || names.includes(n)) return n;
    const key = s => [...s].sort().join('');
    const same = names.find(x => key(x) === key(n));   // 글자는 같고 순서만 다름 (과천정부청사 → 정부과천청사)
    if (same) return same;
    const part = names.filter(x => x.includes(n) || n.includes(x)).sort((a, b) => Math.abs(a.length - n.length) - Math.abs(b.length - n.length))[0];
    return part && Math.min(part.length, n.length) >= 2 ? part : n;
  }
  async function editor(on) {
    S.edit = on; const box = S.box;
    if (!on) { render(); return; }
    const c = load(KEY, { stops: [], transfer: 4, walk: 0 }), s = c.stops || [];
    const field = (id, v, ph) => `<input id="${id}" list="cmStations" value="${esc(v ? label(v) : '')}" placeholder="${ph}" class="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-sm">`;
    box.innerHTML = `<div class="flex items-center justify-between mb-2"><h2 class="text-sm md:text-base font-extrabold text-slate-900">🧭 출퇴근 경로 설정</h2><span role="button" tabindex="0" onclick="Commute.editor(false)" class="cursor-pointer text-xs font-bold text-slate-400">닫기</span></div>
      <div class="space-y-1.5">
        ${field('cm0', s[0], '집 쪽 출발역 (예: 하남검단산)')}
        ${field('cm1', s.length > 2 ? s[1] : '', '환승역 1 (없으면 비워두기)')}
        ${field('cm2', s.length > 3 ? s[2] : '', '환승역 2 (없으면 비워두기)')}
        ${field('cm3', s.length > 1 ? s[s.length - 1] : '', '회사 쪽 도착역 (예: 정부과천청사)')}
        <div class="grid grid-cols-2 gap-2">
          <label class="text-[11px] font-bold text-slate-500">집·회사 → 역 걷는 시간<div class="flex items-center gap-1 mt-0.5"><input id="cmWalk" type="number" min="0" max="60" value="${c.walk || 0}" class="w-full border border-slate-200 rounded-lg px-2 py-1 bg-white"><span>분</span></div></label>
          <label class="text-[11px] font-bold text-slate-500">환승 걷는 시간<div class="flex items-center gap-1 mt-0.5"><input id="cmTr" type="number" min="1" max="20" value="${c.transfer || 4}" class="w-full border border-slate-200 rounded-lg px-2 py-1 bg-white"><span>분</span></div></label>
        </div>
      </div>
      <datalist id="cmStations"></datalist>
      <p id="cmMsg" class="text-[11px] text-rose-600 mt-1.5"></p>
      <div class="flex gap-2 mt-2">
        ${s.length ? `<span role="button" tabindex="0" onclick="Commute.clear()" class="cursor-pointer flex-1 py-2 text-center bg-slate-100 text-slate-500 font-bold text-xs rounded-xl">경로 지우기</span>` : ''}
        <span role="button" tabindex="0" onclick="Commute.save()" id="cmSave" class="cursor-pointer flex-[2] py-2 text-center bg-indigo-600 text-white font-bold text-sm rounded-xl">저장</span>
      </div>
      <p class="text-[10px] text-slate-400 mt-1.5">출근 방향으로 넣으면 퇴근은 자동으로 반대예요. 같은 노선이면 환승역은 비워두세요.</p>`;
    try {
      let st = null; try { const cc = JSON.parse(localStorage.getItem('subway_stations_cache_v1')); if (cc && cc.s) st = cc.s; } catch (e) {}
      if (!st) { const r = await fetch('./api/stations'); st = (await r.json()).stations || []; try { localStorage.setItem('subway_stations_cache_v1', JSON.stringify({ t: Date.now(), s: st })); } catch (e) {} }
      const dl = document.getElementById('cmStations'); if (dl) dl.innerHTML = [...new Set(st.map(x => x[0]))].map(n => `<option value="${esc(n)}">`).join('');
    } catch (e) {}
  }
  async function save() {
    const raw = ['cm0', 'cm1', 'cm2', 'cm3'].map(id => cleanSt(document.getElementById(id).value)).filter(Boolean);
    const stops = raw.map(fixName), fixed = raw.map((n, i) => n !== stops[i] ? `${label(n)} → ${label(stops[i])}` : '').filter(Boolean);
    const msg = document.getElementById('cmMsg'), btn = document.getElementById('cmSave');
    if (stops.length < 2) { msg.textContent = '출발역과 도착역을 넣어 주세요.'; return; }
    const c = { stops, walk: Math.max(0, Math.min(60, Number(document.getElementById('cmWalk').value) || 0)), transfer: Math.max(1, Math.min(20, Number(document.getElementById('cmTr').value) || 4)) };
    btn.textContent = '확인 중…';
    try {
      const tts = await Promise.all(stops.map(s => T().load(s, T().dayType())));
      for (let i = 0; i < stops.length - 1; i++) {
        if (!(tts[i].lines || []).length && !(tts[i].allLines || []).length) { msg.textContent = `'${label(stops[i])}' 시간표를 못 찾았어요. 역 이름을 확인해 주세요.`; btn.textContent = '저장'; return; }
        if (!segTrains(tts[i], tts[i + 1]).length) { msg.textContent = `${label(stops[i])} → ${label(stops[i + 1])} 바로 가는 열차가 없어요. 중간에 환승역을 넣어 주세요.`; btn.textContent = '저장'; return; }
      }
    } catch (e) { msg.textContent = '시간표를 못 불러와서 확인 못 했어요. 잠시 뒤 다시 해 주세요.'; btn.textContent = '저장'; return; }
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
    S.edit = false; S.mode = null; S.rt = null;
    await render();
    if (fixed.length) S.box.insertAdjacentHTML('beforeend', `<p class="text-[10px] font-bold text-amber-600 mt-1">✏️ 역 이름을 고쳐서 저장했어요: ${esc(fixed.join(', '))}</p>`);
    if (S.onChange) S.onChange();
  }
  function clear() { localStorage.removeItem(KEY); S.edit = false; render(); if (S.onChange) S.onChange(); }

  window.Commute = {
    KEY, has: () => { const c = load(KEY, null); return !!(c && c.stops && c.stops.length >= 2); },
    mount(box, opts) { S.box = box; Object.assign(S, opts || {}); return render(); },
    render, editor, save, clear, tick,
    editing: () => S.edit,
    setMode(m) { S.mode = m; S.rt = null; render(); },
    setBasis(b) { S.basis = b; if (b === 'arr' && S.time == null) S.time = Math.ceil((T().nowMins() + 60) / 10) * 10; render(); },
    setTime(v) { if (!v) { S.time = null; } else { const [h, m] = v.split(':').map(Number); S.time = (h < 4 ? h + 24 : h) * 60 + m; } render(); },
    setWeek(w) { S.week = w; render(); },
    pin(dep, dest) {
      const mode = S.mode || autoMode(), all = load(PINS, {}), ps = all[mode] || [];
      const i = ps.findIndex(p => p.dest === dest && Math.abs(p.dep - dep) <= 3);
      if (i >= 0) ps.splice(i, 1); else if (ps.length >= 3) { S.pinMsg = '최대 3개까지예요. ✕로 하나 빼고 다시 눌러주세요'; render(); return; } else ps.push({ dep, dest });
      all[mode] = ps; try { localStorage.setItem(PINS, JSON.stringify(all)); } catch (e) {}
      render();
    }
  };
})();
