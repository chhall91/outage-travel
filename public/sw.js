// Outage Travel service worker — offline-first.
// The precache list and version are injected at build time by the precache plugin in vite.config.js.
const VERSION = '__VERSION__';
const CACHE = `outage-travel-${VERSION}`;
// BASE = the directory this worker is served from ('/' locally, '/field-calc/' on GitHub Pages).
const BASE = new URL('./', self.location.href).pathname;
const PRECACHE = self.__PRECACHE__ || [BASE, BASE + 'index.html', BASE + 'manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('outage-travel-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Forum API: always live, never cached
  if (url.pathname.includes('/api/')) return;

  // Reactor status snapshot: network-first so it stays fresh, cached copy when offline
  if (url.pathname.endsWith('/reactor-status.json')) {
    event.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  // App shell for navigations (hash router => always index.html)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(BASE + 'index.html', copy)); return res; })
        .catch(() => caches.match(BASE + 'index.html').then((r) => r || caches.match(BASE)))
    );
    return;
  }
  // Cache-first for static assets, fill cache on miss
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
