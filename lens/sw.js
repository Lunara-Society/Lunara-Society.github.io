/* Lunara Lens service worker. The app shell works offline; the AI
   calls and the register never come from a cache. */
const CACHE = 'lens-v7';
const SHELL = ['rosario.jpg', 'voice/en/activated.mp3', 'voice/en/allowance.mp3', 'voice/en/breathe_in.mp3', 'voice/en/breathe_out.mp3', 'voice/en/calm.mp3', 'voice/en/checking_file.mp3', 'voice/en/done.mp3', 'voice/en/emergency.mp3', 'voice/en/goodbye.mp3', 'voice/en/guide_off.mp3', 'voice/en/guide_on.mp3', 'voice/en/hello.mp3', 'voice/en/hello_back.mp3', 'voice/en/hold.mp3', 'voice/en/index.json', 'voice/en/link_risky.mp3', 'voice/en/link_safe.mp3', 'voice/en/listening.mp3', 'voice/en/magnifier.mp3', 'voice/en/mark_done.mp3', 'voice/en/no_licence.mp3', 'voice/en/no_mark.mp3', 'voice/en/no_notes.mp3', 'voice/en/not_caught.mp3', 'voice/en/note_saved.mp3', 'voice/en/offline.mp3', 'voice/en/okay.mp3', 'voice/en/one_moment.mp3', 'voice/en/paywall.mp3', 'voice/en/pending.mp3', 'voice/en/qr_found.mp3', 'voice/en/reading.mp3', 'voice/en/reminder_now.mp3', 'voice/en/reminder_set.mp3', 'voice/en/safe_word.mp3', 'voice/en/saved.mp3', 'voice/en/scanning.mp3', 'voice/en/signed_in.mp3', 'voice/en/thinking.mp3', 'voice/en/translating.mp3', 'voice/en/try_saying.mp3', 'voice/en/wake_off.mp3', 'voice/en/wake_on.mp3', 'voice/en/welcome_owner.mp3', 'voice/es/activated.mp3', 'voice/es/allowance.mp3', 'voice/es/breathe_in.mp3', 'voice/es/breathe_out.mp3', 'voice/es/calm.mp3', 'voice/es/checking_file.mp3', 'voice/es/done.mp3', 'voice/es/emergency.mp3', 'voice/es/goodbye.mp3', 'voice/es/guide_off.mp3', 'voice/es/guide_on.mp3', 'voice/es/hello.mp3', 'voice/es/hello_back.mp3', 'voice/es/hold.mp3', 'voice/es/index.json', 'voice/es/link_risky.mp3', 'voice/es/link_safe.mp3', 'voice/es/listening.mp3', 'voice/es/magnifier.mp3', 'voice/es/mark_done.mp3', 'voice/es/no_licence.mp3', 'voice/es/no_mark.mp3', 'voice/es/no_notes.mp3', 'voice/es/not_caught.mp3', 'voice/es/note_saved.mp3', 'voice/es/offline.mp3', 'voice/es/okay.mp3', 'voice/es/one_moment.mp3', 'voice/es/paywall.mp3', 'voice/es/pending.mp3', 'voice/es/qr_found.mp3', 'voice/es/reading.mp3', 'voice/es/reminder_now.mp3', 'voice/es/reminder_set.mp3', 'voice/es/safe_word.mp3', 'voice/es/saved.mp3', 'voice/es/scanning.mp3', 'voice/es/signed_in.mp3', 'voice/es/thinking.mp3', 'voice/es/translating.mp3', 'voice/es/try_saying.mp3', 'voice/es/wake_off.mp3', 'voice/es/wake_on.mp3', 'voice/es/welcome_owner.mp3', 'app.html', 'lens.css', 'lens-i18n.js', 'lens-mark.js', 'lens-forensics.js', 'lens-app.js', 'icon-192.png', 'logo.png', 'manifest.webmanifest', '../lunara-pricing.js'];
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
