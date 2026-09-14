const CACHE = 'pgds-v6';
const CORE = ['/', '/index.html', '/manifest.json', '/SignDocs_icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Only intercept same-origin navigation / static files — never Supabase or CDNs
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => null);
      return r;
    }).catch(() => caches.match(e.request))
  );
});
