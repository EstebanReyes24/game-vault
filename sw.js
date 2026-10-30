const CACHE_NAME = 'paindex-vault-v29';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.html',
  './legal.html',
  './login.html',
  './manifest.json',
  './css/styles.css',
  './css/paindex.css',
  './css/tw.css',
  './favicon.svg',
  './js/supabase.js',
  './js/login.js',
  './js/app.js',
  './js/landing.js',
  './js/search.js',
  './js/storage.js',
  './js/canvas-poster.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith(self.location.origin)) return;
  // Nunca cachear la API (datos personales, p. ej. la biblioteca de Steam) ni peticiones que no sean GET
  if (event.request.method !== 'GET' || /^\/(api|borradores|_vercel)\//.test(new URL(event.request.url).pathname)) return;

  // Páginas, CSS y JS: primero la red, para que cada publicación se vea al instante.
  // La caché queda solo como respaldo sin conexión.
  const dest = event.request.destination;
  if (event.request.mode === 'navigate' || dest === 'script' || dest === 'style') {
    event.respondWith(
      fetch(event.request).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});