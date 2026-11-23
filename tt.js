// 아르곤 자산관리: 지하철 시간표 도우미 (지하철 화면·오늘 화면이 같이 씀)
(function () {
  // 관공서 공휴일 (대체공휴일 포함). 시간표는 공휴일에 '휴일' 시간표로 다녀요.
  const HOLIDAYS = new Set([
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-02', '2026-05-05', '2026-05-25', '2026-06-03', '2026-06-06', '2026-08-15', '2026-08-17',
    '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
    '2027-01-01', '2027-02-06', '2027-02-08', '2027-02-09', '2027-03-01', '2027-05-05', '2027-05-13', '2027-08-16', '2027-09-14', '2027-09-15', '2027-09-16',
    '2027-10-04', '2027-10-09', '2027-10-11', '2027-12-25', '2027-12-27'
  ]);
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // 새벽 4시 전은 전날 운행으로 본다 (막차)
  function serviceDate(now) { const d = new Date(now || Date.now()); if (d.getHours() < 4) d.setDate(d.getDate() - 1); return d; }
  function dayType(now) { const d = serviceDate(now); return HOLIDAYS.has(ymd(d)) || d.getDay() === 0 ? '3' : d.getDay() === 6 ? '2' : '1'; }
  const minsOf = t => { const [h, m] = t.split(':').map(Number); return (h < 4 ? h + 24 : h) * 60 + m; };
  const nowMins = now => { const d = new Date(now || Date.now()), h = d.getHours(); return (h < 4 ? h + 24 : h) * 60 + d.getMinutes() + d.getSeconds() / 60; };
  function upcoming(trains, n, now) { const m = nowMins(now) - 0.5; return trains.filter(t => minsOf(t[0]) >= m).slice(0, n || 4); }
  function untilText(t, now) {
    const left = Math.round(minsOf(t) - nowMins(now));
    if (left <= 0) return '곧';
    return left >= 60 ? `${Math.floor(left / 60)}시간 ${left % 60}분` : `${left}분`;
  }
  // '24:26' → '00:26'
  const disp = t => { const h = Number(t.slice(0, 2)); return h >= 24 ? String(h - 24).padStart(2, '0') + t.slice(2) : t; };
  const mem = {};
  async function load(station, week) {
    const k = `argon_tt_${station}_${week}`;
    if (mem[k]) return mem[k];
    try { const c = JSON.parse(sessionStorage.getItem(k)); if (c && Date.now() - c.t < 6 * 3600e3) return (mem[k] = c.j); } catch (e) {}
    const r = await fetch(`./api/timetable?station=${encodeURIComponent(station)}&week=${week}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || '시간표를 불러오지 못했어요');
    if (!j.needKey) { mem[k] = j; try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), j })); } catch (e) {} }
    return j;
  }
  window.ArgonTT = { disp, dayType, load, upcoming, untilText, minsOf, nowMins, WEEK: { 1: '평일', 2: '토요일', 3: '휴일' } };
})();
