// 든든 사전 — 키 없이 쓰는 공개 사전들을 한 곳에서
//   GET /api/dict?src=en&q=apple    영어 (Free Dictionary API) + 위키낱말사전 한국어 뜻
//   GET /api/dict?src=ko&q=사과     국어 (표준국어대사전: STDICT_KEY 있으면, 없으면 위키낱말사전)
//   GET /api/dict?src=ja&q=ねこ     일본어 (Jisho)
//   GET /api/dict?src=hanja&q=學    한자 (위키낱말사전)
//   GET /api/dict?src=wiki&q=고래   백과 (한국어 위키백과 요약)
const UA = 'DeundeunApp/1.0 (personal app; https://personalfinancetracker-topaz.vercel.app)';
const T = 8000;

function send(res, status, body, maxAge) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', status === 200 ? `public, s-maxage=${maxAge || 86400}, stale-while-revalidate=604800` : 'no-store');
  res.end(JSON.stringify(body));
}
async function getJSON(url, headers) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...(headers || {}) }, signal: AbortSignal.timeout(T) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${new URL(url).hostname} ${r.status}`);
  return r.json();
}
// 위키 문법 → 글자만
function plain(s) {
  return String(s)
    .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<[^>]+>/g, '')
    .replace(/\{\{(?:lang|l|llang|ko-l|ja-l)\|[^|}]*\|([^|}]*)[^}]*\}\}/gi, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '').replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '')
    .replace(/\s+/g, ' ').trim();
}
// 위키낱말사전 문서 → 언어별 { 품사: [뜻] }
async function wiktionary(word) {
  const j = await getJSON(`https://ko.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(word)}&prop=wikitext&format=json&redirects=1&formatversion=2`);
  const text = j && j.parse && j.parse.wikitext; if (!text) return [];
  const out = []; let lang = null, pos = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    let m = line.match(/^==\s*([^=]+?)\s*==$/);
    if (m) { lang = { lang: plain(m[1]), senses: [] }; out.push(lang); pos = null; continue; }
    m = line.match(/^={3,5}\s*([^=]+?)\s*={3,5}$/);
    if (m) { pos = plain(m[1]); continue; }
    const isDef = /^#(?![:*#])/.test(line) || /^\*\s*'''\s*\d+\.?\s*'''/.test(line);
    if (lang && !lang.hanja && /\{\{한자풀이/.test(line)) lang.hanjaOpen = true;
    if (lang && lang.hanjaOpen) {
      const f = line.match(/^\|\s*([^=]+?)\s*=\s*(.*?)(\}\})?$/); if (f) { lang.hanja = lang.hanja || {}; lang.hanja[f[1]] = plain(f[2]); }
      if (/\}\}\s*$/.test(line)) lang.hanjaOpen = false;
      continue;
    }
    if (lang && isDef) {
      const def = plain(line.replace(/^#+\s*/, '').replace(/^\*\s*'''\s*\d+\.?\s*'''\s*/, ''));
      if (def && def.length < 300) lang.senses.push({ pos: pos || '', def });
    } else if (lang && (/^#[:*]/.test(line) || /^:\*?/.test(line)) && lang.senses.length) {
      const ex = plain(line.replace(/^[#:*]+\s*/, '')); const s = lang.senses[lang.senses.length - 1];
      if (ex && !s.ex && ex.length < 200) s.ex = ex;
    }
  }
  return out.filter(l => l.senses.length || l.hanja).map(l => ({ lang: l.lang, hanja: l.hanja ? { 훈: l.hanja['훈'] || '', 음: l.hanja['음'] || '', 부수: [l.hanja['부수'], l.hanja['부수풀이']].filter(Boolean).join(' '), 획: l.hanja['획'] || '', 간체: l.hanja['간체'] || '' } : undefined, senses: l.senses.slice(0, 12) }));
}

// 영어: 서버에서는 영어 위키낱말사전(뜻) + 한국어 위키낱말사전(한국어 뜻). 발음은 브라우저가 Free Dictionary API로 바로 가져감
async function enwikt(q) {
  const j = await getJSON(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(q)}`).catch(() => null);
  return ((j && j.en) || []).filter(x => x.language === 'English').slice(0, 5).map(x => ({ pos: String(x.partOfSpeech || '').toLowerCase(), defs: (x.definitions || []).map(d => ({ def: plain(d.definition), ex: plain(((d.parsedExamples || [])[0] || {}).example || (d.examples || [])[0] || '') })).filter(d => d.def).slice(0, 4), syn: [] })).filter(m => m.defs.length);
}
async function en(q) {
  const [d, w, ew] = await Promise.all([getJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q)}`).catch(() => null), wiktionary(q).catch(() => []), enwikt(q)]);
  const e = Array.isArray(d) ? d : [];
  const phon = e.flatMap(x => x.phonetics || []), audio = (phon.find(p => p.audio && /-us\./.test(p.audio)) || phon.find(p => p.audio) || {}).audio || '';
  const meanings = [];
  e.forEach(x => (x.meanings || []).forEach(m => meanings.push({ pos: m.partOfSpeech, defs: (m.definitions || []).slice(0, 4).map(df => ({ def: df.definition, ex: df.example || '' })), syn: (m.synonyms || []).slice(0, 6) })));
  const ko = (w.find(l => /영어/.test(l.lang)) || { senses: [] }).senses.slice(0, 6);
  if (!meanings.length) meanings.push(...ew);
  if (!meanings.length && !ko.length) return null;
  return { word: (e[0] && e[0].word) || q, phonetic: (e.find(x => x.phonetic) || {}).phonetic || (phon.find(p => p.text) || {}).text || '', audio, ko, meanings: meanings.slice(0, 6) };
}
// 많이 쓰는 뜻 먼저: 표준국어대사전은 등재 번호 순이라, 위키낱말사전(흔한 뜻 위주)과 비슷한 뜻을 올리고
// 옛 제도·전문 분야·방언 같은 뜻은 내린다
const RARE = /조선 시대|고려 시대|신라|백제|고구려|옛날|예전에|불교|유학|성리학|한의학|도교|기독교|천주교|가톨릭|벼슬|관아|관직|군직|궁중|임금|왕실|제사|역사|법률|의학|약학|화학|물리|수학|광물|건설|음악|인명|지명|책 이름/;
const bigrams = s => { const t = String(s).replace(/[^가-힣a-z0-9]/gi, ''), out = new Set(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; };
function similar(a, b) { const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach(x => { if (B.has(x)) n++; }); return n / Math.min(A.size, B.size); }
function rank(items, common) {
  return items.map((it, i) => {
    let sc = 0;
    const sim = Math.max(0, ...common.map(c => similar(it.def, c)));
    sc += sim * 10;
    if (it.type && it.type !== '일반어') sc -= 6;            // 방언·북한어·옛말
    if (RARE.test(it.def)) sc -= 3;
    if (/과의 (한해|두해|여러해)살이|과의 (낙엽|상록)|과의 (곤충|물고기|새)/.test(it.def) && sim < 0.3) sc -= 1;
    return { it, sc, i };
  }).sort((a, b) => b.sc - a.sc || a.i - b.i).map(x => ({ ...x.it, common: x.sc >= 2 }));
}
async function ko(q) {
  const key = process.env.STDICT_KEY;
  if (key) {
    try {
      const [j, w] = await Promise.all([
        getJSON(`https://stdict.korean.go.kr/api/search.do?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&req_type=json&num=20`),
        wiktionary(q).catch(() => [])
      ]);
      const items = j && j.channel && j.channel.item;
      if (items && items.length) {
        const common = ((w.find(l => /한국어/.test(l.lang)) || {}).senses || []).map(s => s.def);
        const list = items.map(it => ({ word: String(it.word).replace(/[-^]/g, ''), sup: it.sup_no && it.sup_no !== '0' ? it.sup_no : '', pos: (it.pos || ''), type: (it.sense && it.sense.type) || '', def: (it.sense && it.sense.definition) || '' }));
        return { src: '표준국어대사전', ranked: true, items: rank(list, common) };
      }
    } catch (e) { /* 위키낱말사전으로 */ }
  }
  const w = await wiktionary(q);
  const k = w.find(l => /한국어/.test(l.lang)) || w[0];
  return k ? { src: '위키낱말사전', items: k.senses.map(s => ({ word: q, pos: s.pos, def: s.def, ex: s.ex || '' })), others: w.filter(l => l !== k).map(l => ({ lang: l.lang, senses: l.senses.slice(0, 3) })) } : null;
}
async function ja(q) {
  const j = await getJSON(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(q)}`);
  const data = (j && j.data) || []; if (!data.length) return null;
  return { items: data.slice(0, 6).map(x => ({ word: (x.japanese[0] || {}).word || (x.japanese[0] || {}).reading || q, reading: (x.japanese[0] || {}).reading || '', common: !!x.is_common, jlpt: (x.jlpt || [])[0] || '', senses: (x.senses || []).slice(0, 3).map(s => ({ pos: (s.parts_of_speech || []).slice(0, 2).join(', '), def: (s.english_definitions || []).slice(0, 4).join('; ') })) })) };
}
async function hanja(q) {
  const w = await wiktionary(q);
  if (!w.length) return null;
  const order = l => /한자/.test(l.lang) ? 0 : /한국어/.test(l.lang) ? 1 : /일본어/.test(l.lang) ? 2 : /중국어/.test(l.lang) ? 3 : 4;
  return { langs: w.sort((a, b) => order(a) - order(b)).slice(0, 5) };
}
async function wiki(q) {
  const sum = t => getJSON(`https://ko.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`);
  let s = await sum(q).catch(() => null);
  if (!s || s.type === 'disambiguation' || !s.extract) {
    const o = await getJSON(`https://ko.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=6&namespace=0&format=json`).catch(() => null);
    const titles = (o && o[1]) || [];
    if (!s || !s.extract) { if (!titles.length) return null; s = await sum(titles[0]).catch(() => null); }
    if (s) s._more = titles.filter(t => t !== s.title).slice(0, 5);
  }
  if (!s || !s.extract) return null;
  return { title: s.title, desc: s.description || '', extract: s.extract, img: (s.thumbnail || {}).source || '', url: ((s.content_urls || {}).mobile || {}).page || '', more: s._more || [] };
}

const SRC = { en, ko, ja, hanja, wiki };
module.exports = async (req, res) => {
  const p = new URL(req.url, 'http://localhost').searchParams, src = p.get('src'), q = String(p.get('q') || '').trim().slice(0, 60);
  if (!SRC[src] || !q) return send(res, 400, { error: '사전 종류와 검색어가 필요해요' });
  try {
    const r = await SRC[src](src === 'en' ? q.toLowerCase() : q);
    if (!r) return send(res, 200, { notFound: true, q, keyed: src === 'ko' ? !!process.env.STDICT_KEY : undefined }, 3600);
    return send(res, 200, { q, ...r, keyed: src === 'ko' ? !!process.env.STDICT_KEY : undefined });
  } catch (e) {
    console.error(src, e.message);
    return send(res, 502, { error: '사전 서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.' });
  }
};
