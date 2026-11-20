// Bump CACHE when shipping changes so phones pick up the new version.
const CACHE = 'booklet-v1.0.0';
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'booklet.js',
  'vendor/pdf-lib.min.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'booklet-share').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Android "Share → Booklet": stash the shared PDF, then open the app.
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const file = form.get('pdf');
      if (file) {
        const c = await caches.open('booklet-share');
        await c.put('shared.pdf', new Response(file, {
          headers: { 'Content-Type': 'application/pdf', 'X-Filename': encodeURIComponent(file.name || 'shared.pdf') },
        }));
      }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }

  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Network first (so updates land quickly), cache fallback for offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
