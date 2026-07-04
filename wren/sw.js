// Wren Command Center — minimal offline-shell service worker
const CACHE = 'wren-shell-v1';
const SHELL = ['/wren/', '/wren/index.html', '/wren/wren-icon.png', '/wren/wren-fullbody.png', '/wren/manifest.json'];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).catch(function(){}));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function(res){
      var resClone = res.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, resClone); });
      return res;
    }).catch(function(){ return caches.match(e.request); })
  );
});
