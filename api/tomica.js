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

// 한 페이지 → 상품 목록. 공식 페이지는 <div class="lineup-box"> 마다 CarName·car-pic·mark-action·쇼핑몰 링크(JAN)가 있다
function parse(html, page) {
  const out = [], seen = new Set();
  for (const blk of html.split(/class=["']lineup-box["']/).slice(1)) {
    const nm = blk.match(/class=["'][^"']*CarName[^"']*["'][^>]*>([\s\S]*?)<\/p>/i); if (!nm) continue;
    const t = strip(nm[1].split(/<br|<span|<small/i)[0]), m = t.match(/No\.\s*(\d{1,3})\s*(.+)/); if (!m) continue;
    const no = +m[1], name = m[2].trim().replace(/\s*[:：].*$/, '').slice(0, 60); if (seen.has(no)) continue; seen.add(no);
    const img = (blk.match(/class=["']car-pic["'][^>]*>\s*<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '';
    const gimmick = strip((blk.match(/class=["']mark-action["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '');
    const jan = (blk.match(/takaratomymall\.jp\/shop\/g\/g(\d{13})/) || [])[1] || '';
    const clean = (gimmick && name.endsWith(gimmick) ? name.slice(0, -gimmick.length) : name).replace(/\s+(?:サスペンション|\S*(?:開閉|可動|回転|上下|伸縮|取り外し|積み下ろし|積み降ろし|旋回|分割|飾り台付き|スタンド付き))(?:[\s/／、・]+\S*)*$/, '').trim() || name;
    out.push({ no, name: clean, img: img ? abs(img, page) : '', gimmick: gimmick.slice(0, 60), jan, page });
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
      if (q.get('no')) { const n = q.get('no'), idx = [...index.matchAll(new RegExp('No\\.' + n + '[^0-9]', 'g'))].map(x => x.index); return send(res, 200, { idx, snips: idx.slice(1, 3).map(i => index.slice(i - 700, i + 900)) }, 0); }
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
