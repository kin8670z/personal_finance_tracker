// 토미카 현행 라인업 — 타카라토미 공식 사이트 "商品ラインナップ" 페이지를 읽어서 번호·이름·사진 정리
//   GET /api/tomica → { items: [{ no, name, img, gimmick, page }], at }
//   GET /api/tomica?debug=1 → 페이지 구조 확인용
const BASE = 'https://www.takaratomy.co.jp/products/tomica/lineup/regular/';
const UA = 'Mozilla/5.0 (compatible; DeundeunApp/1.0; personal collection tracker)';
function send(res, status, body, maxAge) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', status === 200 ? `public, s-maxage=${maxAge}, stale-while-revalidate=604800` : 'no-store');
  res.end(JSON.stringify(body));
}
async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja' }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`${url.split('/').pop()} ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const head = buf.slice(0, 2000).toString('latin1');
  const enc = /charset=["']?(shift_jis|sjis|euc-jp)/i.test(head) ? (/euc/i.test(head) ? 'euc-jp' : 'shift_jis') : 'utf-8';
  return new TextDecoder(enc).decode(buf);
}
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const abs = (u, page) => { try { return new URL(u, BASE + page).href; } catch (e) { return ''; } };

// 한 페이지 → 상품 목록. "No.12 이름" 이 나오는 블록마다 가장 가까운 상품 이미지를 붙인다
function parse(html, page) {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const out = [], seen = new Set();
  const re = /<(h[2-5]|p|div|span|li|dt|dd)[^>]*>\s*(?:<[^>]+>\s*)*No\.\s*(\d{1,3})\s*([^<]{2,80})/gi;
  let m;
  while ((m = re.exec(body))) {
    const no = +m[2], name = strip(m[3]).replace(/^[\s　]+/, '');
    if (!name || seen.has(no)) continue;
    // 앞뒤 1500자 안의 이미지 중 상품 사진(.jpg/.png, 로고·아이콘 제외)
    const win = body.slice(Math.max(0, m.index - 1500), m.index + 1500), imgs = [...win.matchAll(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp))["']/gi)].map(x => x[1]).filter(u => !/logo|icon|btn|bnr|banner|arrow|common/i.test(u));
    const near = imgs.length ? imgs[Math.min(imgs.length - 1, Math.floor(imgs.length / 2))] : '';
    const after = strip(body.slice(m.index + m[0].length, m.index + m[0].length + 400)).replace(new RegExp(`No\\.\\s*${no}\\s*` + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').trim();
    const gimmick = (after.match(/^([^。]*?(?:サスペンション|開閉|可動|回転|上下|伸縮|取り外し|連結)[^No]*?)(?=No\.|購入|$)/) || [])[1] || '';
    seen.add(no); out.push({ no, name, img: near ? abs(near, page) : '', gimmick: gimmick.slice(0, 60).trim(), page });
  }
  return out;
}

module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://localhost').searchParams;
  try {
    const index = await get(BASE + 'index.htm');
    // 번호대별 페이지 링크 (001-020.htm … 및 롱타입)
    const pages = ['index.htm', ...new Set([...index.matchAll(/href=["'](?:\.\/|[^"']*\/lineup\/regular\/)?(\d{3}-\d{3}\.htm)["']/gi)].map(x => x[1]))];
    const longLinks = [...new Set([...index.matchAll(/href=["']([^"']*lineup\/(?:long|regular_long|longtype)[^"']*\.htm)["']/gi)].map(x => x[1]))];
    if (q.get('debug') === '1') {
      const i = index.indexOf('No.1');
      return send(res, 200, { pages, longLinks, snippet: index.slice(Math.max(0, i - 800), i + 1200), parsed: parse(index, 'index.htm').slice(0, 5) }, 0);
    }
    const htmls = await Promise.all(pages.map(p => (p === 'index.htm' ? Promise.resolve(index) : get(BASE + p)).catch(() => '')));
    const longHtml = await Promise.all(longLinks.slice(0, 4).map(u => get(new URL(u, BASE).href).catch(() => '')));
    const items = [], seen = new Set();
    htmls.forEach((h, i) => parse(h, pages[i]).forEach(x => { if (!seen.has(x.no)) { seen.add(x.no); items.push(x); } }));
    longHtml.forEach((h, i) => parse(h, longLinks[i]).forEach(x => { if (!seen.has(x.no)) { seen.add(x.no); items.push({ ...x, long: true }); } }));
    items.sort((a, b) => a.no - b.no);
    if (!items.length) return send(res, 502, { error: '공식 사이트에서 목록을 못 읽었어요' });
    return send(res, 200, { items, at: new Date().toISOString() }, 43200);
  } catch (e) {
    console.error('tomica', e.message);
    return send(res, 502, { error: '공식 사이트에 연결하지 못했어요', detail: e.message });
  }
};
