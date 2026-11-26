// 애니 방영표 — AniList GraphQL (공개, 키 없음). api/games.js가 svc=anime 일 때 넘겨줌 (Hobby 함수 12개 제한)
//   GET /api/games?svc=anime&op=season&y=2026&s=FALL → { items: [...] }
//   GET /api/games?svc=anime&op=search&q=프리렌   → { items: [...] }
//   GET /api/games?svc=anime&op=ids&ids=1,2,3     → { items: [...] }
// item: { id, t(한국어 제목 있으면), en, ro, jp, cover, eps, st, next: { ep, at(초) } | null, fmt, url, sites[] }
const URL_ = 'https://graphql.anilist.co';
const FIELDS = 'id title{romaji english native} synonyms coverImage{medium} episodes status format siteUrl nextAiringEpisode{airingAt episode} externalLinks{site}';
const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

function send(res, status, body, maxAge) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', status === 200 ? `public, s-maxage=${maxAge}, stale-while-revalidate=86400` : 'no-store');
  res.end(JSON.stringify(body));
}
const ko = arr => (arr || []).find(s => /[가-힣]/.test(s)) || '';
const slim = m => ({
  id: m.id, t: ko(m.synonyms) || m.title.english || m.title.romaji, en: m.title.english || '', ro: m.title.romaji || '', jp: m.title.native || '',
  cover: (m.coverImage || {}).medium || '', eps: m.episodes || null, st: m.status, fmt: m.format, url: m.siteUrl,
  next: m.nextAiringEpisode ? { ep: m.nextAiringEpisode.episode, at: m.nextAiringEpisode.airingAt } : null,
  sites: [...new Set((m.externalLinks || []).map(l => l.site))].slice(0, 8)
});
async function gql(query, variables) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(URL_, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) });
    const j = await r.json(); if (j.errors) throw new Error(j.errors[0].message); return j.data;
  } finally { clearTimeout(to); }
}

module.exports = async (req, res) => {
  const p = new URL(req.url, 'http://localhost').searchParams, op = p.get('op') || 'season';
  try {
    if (op === 'season') {
      const y = Number(p.get('y')) || new Date().getFullYear(), s = SEASONS.includes(p.get('s')) ? p.get('s') : 'FALL', out = [];
      for (let page = 1; page <= 3; page++) {
        const d = await gql(`query($y:Int,$s:MediaSeason,$p:Int){Page(page:$p,perPage:50){pageInfo{hasNextPage} media(season:$s,seasonYear:$y,type:ANIME,format_in:[TV,TV_SHORT,ONA],isAdult:false,sort:POPULARITY_DESC){${FIELDS}}}}`, { y, s, p: page });
        out.push(...d.Page.media.map(slim)); if (!d.Page.pageInfo.hasNextPage) break;
      }
      return send(res, 200, { y, s, items: out }, 21600);
    }
    if (op === 'search') {
      const q = String(p.get('q') || '').trim().slice(0, 50); if (!q) return send(res, 400, { error: '검색어가 필요해요' });
      const d = await gql(`query($q:String){Page(perPage:20){media(search:$q,type:ANIME,isAdult:false,sort:SEARCH_MATCH){${FIELDS}}}}`, { q });
      return send(res, 200, { items: d.Page.media.map(slim) }, 86400);
    }
    if (op === 'ids') {
      const ids = String(p.get('ids') || '').split(',').map(Number).filter(Boolean).slice(0, 50); if (!ids.length) return send(res, 200, { items: [] }, 60);
      const d = await gql(`query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){${FIELDS}}}}`, { ids });
      return send(res, 200, { items: d.Page.media.map(slim) }, 3600);
    }
    return send(res, 400, { error: 'op?' });
  } catch (e) {
    return send(res, 502, { error: e.name === 'AbortError' ? 'AniList가 늦어요. 잠시 뒤 다시' : 'AniList 조회 실패 — ' + String(e.message || e).slice(0, 80) });
  }
};
