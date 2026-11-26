// 게임 출시 캘린더 — 영어 위키백과 "List of video games released in {연도}" 표를 읽어서 정리
//   GET /api/games?y=2026 → { year, games: [[날짜|'', 제목, 문서있음 0/1, 플랫폼[], 종류, 장르, 개발, 배급, 지역, 대략시기]], at }
// 문서가 커서(수백 KB) 엣지에 6시간 캐시한다. (CC BY-SA, 출처 표시는 화면에서)
const UA = 'DeundeunApp/1.0 (personal app; https://personalfinancetracker-topaz.vercel.app)';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function send(res, status, body, maxAge) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', status === 200 ? `public, s-maxage=${maxAge}, stale-while-revalidate=86400` : 'no-store');
  res.end(JSON.stringify(body));
}
// 위키 문법 → 글자
function plain(s) {
  let t = String(s || '');
  for (let i = 0; i < 3; i++) t = t.replace(/\{\{(?:nowrap|nobr|small|abbr|sort|lang\|[a-z-]+)\|([^{}|]*)(?:\|[^{}]*)?\}\}/gi, '$1').replace(/\{\{[^{}]*\}\}/g, '');
  return t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
// | 로 나누되 [[ ]], {{ }} 안의 | 는 무시
function splitTop(s, sep) {
  const out = []; let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === '[[' || two === '{{') { depth++; cur += two; i++; continue; }
    if ((two === ']]' || two === '}}') && depth) { depth--; cur += two; i++; continue; }
    if (!depth && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; continue; }
    cur += s[i];
  }
  out.push(cur); return out;
}
function cell(raw) {
  const parts = splitTop(raw, '|');
  let attrs = '', text = raw;
  if (parts.length > 1 && /^\s*[\w-]+\s*=/.test(parts[0])) { attrs = parts[0]; text = parts.slice(1).join('|'); }
  const num = k => { const m = attrs.match(new RegExp(k + '\\s*=\\s*"?(\\d+)')); return m ? +m[1] : 1; };
  return { text: text.trim(), rs: num('rowspan'), cs: num('colspan') };
}
// 위키 표 하나 → 행 배열 (rowspan·colspan 펼침)
function parseTable(src) {
  const lines = src.split('\n'), heads = [], rows = []; let row = null, pending = [];
  const flush = () => {
    if (!row || !row.length) { row = []; return; }
    const out = []; let k = 0;
    const take = () => { while (pending[k] && pending[k].left > 0) { out[k] = pending[k].text; pending[k].left--; k++; } };
    take();
    for (const c of row) { for (let j = 0; j < c.cs; j++) { out[k] = c.text; if (c.rs > 1) pending[k] = { text: c.text, left: c.rs - 1 }; k++; } take(); }
    while (k < heads.length) { if (pending[k] && pending[k].left > 0) { out[k] = pending[k].text; pending[k].left--; } k++; }
    rows.push(out); row = [];
  };
  for (const ln of lines) {
    if (/^\{\|/.test(ln) || /^\|\}/.test(ln)) continue;
    if (/^\|-/.test(ln)) { flush(); continue; }
    if (/^!/.test(ln)) { splitTop(ln.slice(1), '!!').forEach(h => heads.push(plain(cell(h).text))); continue; }
    if (/^\|/.test(ln)) { row = row || []; splitTop(ln.slice(1), '||').forEach(c => row.push(cell(c))); continue; }
    if (row && row.length) row[row.length - 1].text += '\n' + ln;
  }
  flush();
  return { heads, rows };
}

async function load(year) {
  const r = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=List_of_video_games_released_in_${year}&prop=wikitext&format=json&formatversion=2&redirects=1`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('wikipedia ' + r.status);
  const j = await r.json(); let text = j.parse && j.parse.wikitext;
  if (!text) return null;
  text = text.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const games = [], seen = new Set();
  const tables = text.match(/\{\|[^\n]*wikitable[\s\S]*?\n\|\}/g) || [];
  for (const tb of tables) {
    const { heads, rows } = parseTable(tb);
    const col = re => heads.findIndex(h => re.test(h));
    const cDate = col(/^release date/i), cApprox = col(/approximate/i), cTitle = col(/^title/i), cPlat = col(/platform/i), cType = col(/^type/i), cGenre = col(/genre/i), cDev = col(/developer/i), cPub = col(/publisher/i);
    if (cTitle < 0 || (cDate < 0 && cApprox < 0)) continue;
    for (const r of rows) {
      const rawTitle = r[cTitle] || ''; if (!rawTitle.trim()) continue;
      const linked = /\[\[/.test(rawTitle) ? 1 : 0;
      let title = plain(rawTitle), region = '';
      const rm = title.match(/\s*\(([A-Z]{2,3}(?:,\s*[A-Z]{2,3})*)\)\s*$/); if (rm) { region = rm[1]; title = title.slice(0, rm.index).trim(); }
      let date = '', approx = '';
      if (cDate >= 0) {
        const d = plain(r[cDate]).toLowerCase(), m = d.match(/([a-z]+)\s+(\d{1,2})/), mi = m ? MONTHS.indexOf(m[1]) : MONTHS.findIndex(x => d.startsWith(x));
        if (m && mi >= 0) date = `${year}-${String(mi + 1).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`;
        else if (mi >= 0) approx = `${year}-${String(mi + 1).padStart(2, '0')}`;   // 달만 정해짐
        else approx = plain(r[cDate]) || '미정';
      } else approx = plain(r[cApprox]) || '미정';
      const plats = plain(r[cPlat] || '').split(/\s*,\s*/).filter(Boolean);
      const key = title + '|' + date + '|' + plats.join(',');
      if (!title || seen.has(key)) continue; seen.add(key);
      games.push([date, title, linked, plats, plain(r[cType] || ''), plain(r[cGenre] || ''), plain(r[cDev] || '').slice(0, 60), plain(r[cPub] || r[cDev] || '').slice(0, 60), region, approx]);
    }
  }
  return games;
}

const anime = require('../lib/anime.js');

module.exports = async (req, res) => {
  if (String(req.url).includes('svc=anime')) return anime(req, res);   // 📺 애니 방영표 (lib/anime.js)
  const now = new Date(), y = Number(new URL(req.url, 'http://localhost').searchParams.get('y')) || now.getFullYear();
  if (y < 2000 || y > now.getFullYear() + 2) return send(res, 400, { error: '연도를 확인해 주세요' });
  try {
    const games = await load(y);
    if (!games) return send(res, 200, { year: y, games: [], missing: true }, 3600);
    return send(res, 200, { year: y, games, at: new Date().toISOString() }, 21600);
  } catch (e) {
    console.error(e.message);
    return send(res, 502, { error: '위키백과에서 목록을 못 불러왔어요. 잠시 뒤 다시 해 주세요.' });
  }
};
