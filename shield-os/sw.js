const CACHE = 'shield-os-v1';
const BASE = '/shield-os/';
const ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'bg-mobile.jpg',
  BASE + 'manifest.json',
  BASE + 'shield-logo.jpg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(err => console.warn('Cache partial:', err)))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Only handle same-origin requests within /shield-os/
  var url = new URL(e.request.url);
  if(url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(response => {
      // Cache successful responses
      if(response && response.status === 200 && response.type === 'basic'){
        var clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return response;
    }).catch(() => caches.match(BASE + 'index.html')))
  );
});
