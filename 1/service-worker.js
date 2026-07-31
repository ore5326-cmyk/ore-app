/* =====================================================
   service-worker.js  –  Cache-first with network update
   戦略: 初回はネットワークから取得してキャッシュ。
         2回目以降はキャッシュから即時返却。
         バックグラウンドでネットワークと照合し、
         差分があれば新しいキャッシュへ切り替える。
   ===================================================== */

const CACHE_NAME = 'todo-v1';

const ASSETS = [
  './index.html',
  './icon-192.png',
  './icon-512.png'
];

/* ── Install: 全アセットをキャッシュに保存 ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  /* 古い SW が残っていてもすぐ有効化 */
  self.skipWaiting();
});

/* ── Activate: 古いキャッシュを削除 ── */
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
  /* 開いているタブをすぐに制御下に置く */
  self.clients.claim();
});

/* ── Fetch: Stale-While-Revalidate ── */
self.addEventListener('fetch', event => {
  /* GET リクエストのみ対象 */
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);

      /* バックグラウンドでネットワーク取得 & キャッシュ更新 */
      const networkFetch = fetch(event.request)
        .then(response => {
          if (response && response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      /* キャッシュがあれば即返却、なければネットワーク待ち */
      return cached || networkFetch;
    })
  );
});
