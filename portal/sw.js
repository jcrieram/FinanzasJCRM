// Service worker del portal UroWorkNet (PWA "añadir a inicio").
// Network-first: siempre intenta la última versión; el caché es solo
// respaldo sin conexión. No intercepta /api/.
const CACHE = 'uwn-portal-v1';
const ASSETS = [
    '/portal/',
    '/portal/index.html',
    '/portal/manifest.webmanifest',
    '/portal/icon-192.png',
    '/portal/icon-512.png',
    '/portal/imageportal.jpeg'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

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
