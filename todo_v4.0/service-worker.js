/* =====================================================
   service-worker.js  -  Cache-first with network update
   Strategy: First load fetches from network and caches it.
             From then on, cache is returned instantly.
             In the background, it re-checks the network and
             swaps in a fresh copy if there's a difference.
   ===================================================== */

const CACHE_NAME = 'todo-v13';

const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* -- Install: cache all core assets -- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  /* Activate immediately even if an old SW is still around */
  self.skipWaiting();
});

/* -- Activate: remove old caches -- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  /* Take control of any already-open tabs right away */
  self.clients.claim();
});

/* -- Fetch: Stale-While-Revalidate -- */
self.addEventListener('fetch', event => {
  /* Only handle GET requests */
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);

      /* Fetch from network in the background and refresh the cache */
      const networkFetch = fetch(event.request)
        .then(response => {
          if (response && response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      /* Return cache immediately if present, otherwise wait on network */
      return cached || networkFetch;
    })
  );
});
