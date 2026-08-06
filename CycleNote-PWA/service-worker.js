const CACHE_VERSION = 'v2';
const CACHE_NAME = `cyclenote-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './index.html',
  './style.css',
  './script.js',
  './icon-192.png',
  './icon-512.png',
  './manifest.json'
];

function isPrecacheRequest(request) {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;

  const path = url.pathname;
  return PRECACHE_URLS.some((asset) => {
    const name = asset.replace('./', '');
    return path.endsWith(`/${name}`) || path.endsWith(name);
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('cyclenote-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (!isPrecacheRequest(event.request)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
