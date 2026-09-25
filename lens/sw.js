/* Lunara Lens service worker. The app shell works offline; the AI
   calls and the register never come from a cache. */
const CACHE = 'lens-v1';
const SHELL = ['app.html', 'lens.css', 'lens-i18n.js', 'lens-mark.js', 'lens-forensics.js', 'lens-app.js', 'icon-192.png', 'manifest.webmanifest', '../lunara-pricing.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Our own files: network first so updates arrive, the cache when offline.
  if (u.origin === location.origin) {
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  // The text-recognition engine and fonts: cache first, they never change at a pinned version.
  if (/cdn\.jsdelivr\.net|tessdata|fonts\.(googleapis|gstatic)\.com/.test(u.host + u.pathname)) {
    e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; })));
  }
});
