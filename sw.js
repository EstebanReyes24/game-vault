const CACHE_NAME = 'paindex-vault-v51';
// Lo mínimo para que la app abra sin internet (el resto se guarda al visitarlo)
const ASSETS_TO_CACHE = [
  '/',
  '/estante',
  '/offline',
  '/manifest.json',
  '/css/styles.css',
  '/css/paindex.css',
  '/css/tw.css',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/js/supabase.js',
  '/js/pwa.js',
  '/js/offline.js',
  '/js/app.js',
  '/js/landing.js',
  '/js/search.js',
  '/js/storage.js',
  '/js/canvas-poster.js'
];

self.addEventListener('install', (event) => {
  // Uno a uno: si un archivo falla, los demás se guardan igual
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(ASSETS_TO_CACHE.map((url) => cache.add(url).catch(() => null))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))))
  );
  self.clients.claim();
});

// Sin conexión: la misma página guardada; el estante con cualquier parámetro abre el estante guardado;
// lo demás, la página de "sin conexión"
async function respaldo(request) {
  const exacta = await caches.match(request);
  if (exacta) return exacta;
  const ruta = new URL(request.url).pathname;
  if (request.mode === 'navigate') {
    const sinParametros = await caches.match(request, { ignoreSearch: true });
    if (sinParametros) return sinParametros;
    if (ruta === '/') {
      const inicio = await caches.match('/');
      if (inicio) return inicio;
    }
    if (/^\/(estante|app)/.test(ruta)) {
      const estante = await caches.match('/estante');
      if (estante) return estante;
    }
    return (await caches.match('/offline')) || Response.error();
  }
  return Response.error();
}

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
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      }).catch(() => respaldo(event.request))
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
      }).catch(() => cachedResponse || Response.error());

      return cachedResponse || fetchPromise;
    })
  );
});
