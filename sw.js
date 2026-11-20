// 아르곤 가계부 서비스 워커: 홈 화면 앱 설치 + 오프라인일 때 마지막 화면 보여주기
// 항상 네트워크를 먼저 쓰고(최신 버전 유지), 안 될 때만 저장해 둔 화면을 꺼낸다.
// 시세 API(/api/)와 외부 사이트 요청은 건드리지 않는다.
const CACHE = 'argon-shell-v2';
const CDN = ['cdn.tailwindcss.com', 'cdn.jsdelivr.net'];
const SHELL = ['./', './index.html', './stocks.html', './assets.html', './manifest.json', './icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // 화면 스타일·차트 라이브러리(CDN)는 저장본을 먼저 쓰고 뒤에서 갱신 → 오프라인에서도 모양 유지
  if (CDN.includes(url.hostname)) {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
    return;
  }
  if (url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)).then(r => r || Response.error()))
  );
});
