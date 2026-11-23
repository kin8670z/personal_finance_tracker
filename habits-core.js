// 든든: 습관 체크 공통 (습관 화면 · 오늘 화면)
// argon_habits_v1 = { habits: [{ id, emoji, name, target, auto }], log: { 'YYYY-MM-DD': { [id]: 횟수 } } }
// auto: 'lang' = 여행 외국어를 공부한 날, 'diary' = 한줄 일기를 쓴 날 → 저절로 체크
(function () {
  const KEY = 'argon_habits_v1';
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const DEFAULT = [
    { id: 1, emoji: '💧', name: '물 마시기', target: 8 },
    { id: 2, emoji: '💊', name: '영양제', target: 1 },
    { id: 3, emoji: '🏃', name: '운동 30분', target: 1 },
    { id: 4, emoji: '🗣️', name: '외국어 공부', target: 1, auto: 'lang' },
    { id: 5, emoji: '📔', name: '한줄 일기', target: 1, auto: 'diary' }
  ];
  function get() { const s = load(KEY, null); return s && s.habits ? Object.assign({ log: {} }, s) : { habits: DEFAULT.map(h => ({ ...h })), log: {} }; }
  function put(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  // 자동 습관: 다른 화면 기록을 보고 판단
  function autoDone(kind, date) {
    if (kind === 'lang') return ['argon_english_v1', 'argon_japanese_v1'].some(k => { const v = load(k, null); return v && v.days && v.days[date] > 0; });
    if (kind === 'diary') { const v = load('argon_diary_v1', null); return !!(v && (v.entries || []).some(x => x.date === date)); }
    return false;
  }
  function count(s, h, date) { if (h.auto) return autoDone(h.auto, date) ? (h.target || 1) : 0; return ((s.log[date] || {})[h.id]) || 0; }
  const done = (s, h, date) => count(s, h, date) >= (h.target || 1);
  // 탭 한 번 = 1회 (목표 다 채운 뒤 누르면 0으로)
  function tap(s, id, date) {
    const h = s.habits.find(x => x.id === id); if (!h || h.auto) return s;
    const day = s.log[date] = s.log[date] || {}, n = day[id] || 0;
    day[id] = n >= (h.target || 1) ? 0 : n + 1;
    if (!day[id]) delete day[id];
    put(s); return s;
  }
  function streak(s, h) {
    let n = 0; const d = new Date(); if (!done(s, h, ymd(d))) d.setDate(d.getDate() - 1);
    while (done(s, h, ymd(d)) && n < 3650) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  window.Habits = { KEY, ymd, get, put, count, done, tap, streak, autoDone };
})();
