// 애니 → TMDB: 한국어 제목·포스터·한국(KR)에서 볼 수 있는 OTT (JustWatch 데이터). api/games.js가 svc=tmdb 일 때 넘겨줌
//   GET /api/games?svc=tmdb&q=[[aniId, "english", "romaji", "native", year], ...]  (최대 20개)
//   → { items: { [aniId]: { tm, ko, poster, kr: [{ n, t }], link } | null } }
//   t: 'flat' 구독 · 'free' 무료 · 'ads' 광고 · 'rent' 대여 · 'buy' 구매
// 키: Vercel 환경변수 TMDB_KEY (v3 API 키 또는 v4 읽기 토큰 둘 다 됨). 화면엔 TMDB·JustWatch 출처 표시 필수.
const BASE = 'https://api.themoviedb.org/3';

function send(res, status, body, maxAge) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', status === 200 ? `public, s-maxage=${maxAge}, stale-while-revalidate=86400` : 'no-store');
  res.end(JSON.stringify(body));
}
async function tm(path, params) {
  const key = process.env.TMDB_KEY, v4 = /^eyJ/.test(key || ''), u = new URL(BASE + path);
  Object.entries(params || {}).forEach(([k, v]) => v != null && v !== '' && u.searchParams.set(k, v));
  if (!v4) u.searchParams.set('api_key', key);
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(u, { signal: ctl.signal, headers: Object.assign({ Accept: 'application/json' }, v4 ? { Authorization: 'Bearer ' + key } : {}) });
    if (r.status === 401) throw Object.assign(new Error('TMDB 키가 맞지 않아요'), { auth: true });
    if (!r.ok) throw new Error('TMDB ' + r.status);
    return r.json();
  } finally { clearTimeout(to); }
}
// "Season 3", "2nd Season", "Part 2", "第2期" 같은 걸 떼야 TMDB(시리즈 하나)에서 찾아짐
const clean = s => String(s || '').replace(/[:\-–]\s*(season|part|cour)\s*\d+.*$/i, '').replace(/\b(season|part|cour)\s*\d+\b.*$/i, '').replace(/\b\d+(st|nd|rd|th)\s+season\b.*$/i, '').replace(/\s*第\d+期.*$/, '').replace(/\s*(\d+기|시즌\s*\d+)$/, '').trim();
async function match(row) {
  const [, en, ro, jp, y] = row, tried = new Set(), qs = [en, ro, jp].map(clean).filter(Boolean), nz = s => String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  const exact = x => qs.some(q => nz(q) && (nz(q) === nz(x.name) || nz(q) === nz(x.original_name)));
  for (const q of qs) {
    if (tried.has(q)) continue; tried.add(q);
    const j = await tm('/search/tv', { query: q, language: 'ko-KR', include_adult: 'false' });
    const xs = (j.results || []).filter(x => (x.genre_ids || []).includes(16) && (!x.original_language || x.original_language === 'ja' || x.origin_country?.includes('JP')));
    if (!xs.length) continue;
    // 제목이 딱 맞는 것 → 이 작품보다 늦게 시작한 건 뒤로 → 인기순 (시즌제는 첫 방영이 훨씬 이르니 연도 '가까움'은 안 씀. 예: 블랙클로버 2기 ≠ 스핀오프)
    const late = x => +String(x.first_air_date || '0').slice(0, 4) > y + 1;
    xs.sort((a, b) => (exact(b) - exact(a)) || (late(a) - late(b)) || (b.popularity - a.popularity));
    return xs[0];
  }
  return null;
}
async function detail(id) {
  const d = await tm(`/tv/${id}`, { language: 'ko-KR', append_to_response: 'watch/providers' });
  const kr = ((d['watch/providers'] || {}).results || {}).KR || {}, seen = new Set(), out = [];
  [['flatrate', 'flat'], ['free', 'free'], ['ads', 'ads'], ['rent', 'rent'], ['buy', 'buy']].forEach(([k, t]) => (kr[k] || []).forEach(p => { const n = String(p.provider_name).replace(/\s+(Standard with Ads|Basic with Ads|Amazon Channel).*$/i, '').replace(/^Netflix.*/, 'Netflix'); if (!seen.has(n)) { seen.add(n); out.push({ n, t }); } }));
  return { tm: id, ko: d.name || '', poster: d.poster_path ? 'https://image.tmdb.org/t/p/w154' + d.poster_path : '', kr: out, link: kr.link || '' };
}

module.exports = async (req, res) => {
  if (!process.env.TMDB_KEY) return send(res, 200, { needKey: true, items: {} }, 60);
  let rows; try { rows = JSON.parse(new URL(req.url, 'http://localhost').searchParams.get('q') || '[]'); } catch (e) { rows = []; }
  rows = (Array.isArray(rows) ? rows : []).filter(r => Array.isArray(r) && r[0]).slice(0, 20).map(r => [Number(r[0]), String(r[1] || '').slice(0, 80), String(r[2] || '').slice(0, 80), String(r[3] || '').slice(0, 80), Number(r[4]) || new Date().getFullYear()]);
  const items = {};
  try {
    for (let i = 0; i < rows.length; i += 5) {
      await Promise.all(rows.slice(i, i + 5).map(async r => { try { const m = await match(r); items[r[0]] = m ? await detail(m.id) : null; } catch (e) { if (e.auth) throw e; items[r[0]] = undefined; } }));
    }
    return send(res, 200, { items }, 86400);
  } catch (e) {
    return send(res, e.auth ? 200 : 502, { error: e.message, items: {} }, 60);
  }
};
