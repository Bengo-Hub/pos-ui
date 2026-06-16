/* eslint-disable no-restricted-globals */
//
// Hand-written offline-first service worker for the POS PWA.
//
// Why hand-written: Next.js 16 builds with Turbopack, and @ducanh2912/next-pwa is a webpack
// plugin — it does NOT run under Turbopack, so no SW was being generated and /sw.js fell
// through to the tenant router (→ blank page on any reload during an outage). This static
// file is served at /sw.js (public/ assets bypass app routing) and gives the terminal a real
// offline shell so a reload mid-outage still boots and reads the offline queue from IndexedDB.
//
// Strategy:
//   - navigations (document): network-first, fall back to the cached document for that URL
//     (then to any cached navigation) when offline — this is what stops the blank screen.
//   - /_next/static + assets: cache-first (immutable, content-hashed).
//   - /api + cross-origin: network-only (the app handles offline via IndexedDB; never cache
//     API responses or auth redirects).
//   - sync / periodicsync 'sync-pos-data': wake open clients to drain the offline queue.

const VERSION = 'pos-sw-v1';
const DOC_CACHE = `${VERSION}-documents`;
const ASSET_CACHE = `${VERSION}-assets`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Let the update banner activate a waiting worker immediately.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|gif|webp|ico)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only handle same-origin requests; let API/cross-origin go straight to the network.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigations (full document loads / reloads) → network-first with cached-document fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          // Cache successful HTML responses by URL so an offline reload can serve them back.
          if (fresh && fresh.status === 200 && fresh.type === 'basic') {
            const cache = await caches.open(DOC_CACHE);
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          const cache = await caches.open(DOC_CACHE);
          // Prefer the exact URL; fall back to any cached navigation (the app shell boots the
          // right route client-side from the address bar + persisted state regardless).
          const exact = await cache.match(request, { ignoreSearch: true });
          if (exact) return exact;
          const any = (await cache.keys())[0];
          if (any) return cache.match(any);
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>Offline</title><body style="font-family:system-ui;padding:2rem">Offline — reopen when connection returns.</body>',
            { headers: { 'Content-Type': 'text/html' }, status: 200 },
          );
        }
      })(),
    );
    return;
  }

  // Static assets → cache-first (content-hashed, safe to serve stale).
  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.status === 200) cache.put(request, fresh.clone());
          return fresh;
        } catch {
          return cached || Response.error();
        }
      })(),
    );
  }
});

// Background Sync bridge — when connectivity returns the browser fires this; wake open clients
// so the in-page sync worker drains the IndexedDB queue. (Full tab-closed drain is out of scope.)
function wakeClientsToSync() {
  return self.clients
    .matchAll({ includeUncontrolled: true, type: 'window' })
    .then((clients) => clients.forEach((c) => c.postMessage({ type: 'POS_SYNC' })));
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pos-data') event.waitUntil(wakeClientsToSync());
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-pos-data') event.waitUntil(wakeClientsToSync());
});
