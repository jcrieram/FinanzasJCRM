const CACHE = 'consulta-v2';
const ASSETS = ['./', './index.html', './app.js', './manifest.json'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Network-first para HTML/JS/manifest: siempre intentamos traer la última versión.
// Cache sirve sólo como fallback cuando no hay red.
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    if (url.pathname.startsWith('/api/')) return;
    if (e.request.method !== 'GET') return;
    e.respondWith(
        fetch(e.request).then((res) => {
            if (res.ok && url.origin === location.origin) {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
            }
            return res;
        }).catch(() => caches.match(e.request))
    );
});
