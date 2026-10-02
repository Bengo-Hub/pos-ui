/* eslint-disable no-restricted-globals */
//
// Codevertex media cache for the PWA service worker (loaded by sw.js via importScripts, BEFORE
// sw.js registers its own fetch handler, so this one answers media requests first).
//
// Keeps product/menu images, logos and covers on the device so screens paint from cache instead
// of re-downloading from the API pod on every view (Cloudflare then serves the rest from the edge).
//
//   - Which requests: GET images from our API hosts' /media/ tree, and Next's same-origin image
//     optimizer (/_next/image). Everything else is left to sw.js.
//   - Cross-origin <img> loads are opaque, and browsers pad each opaque cache entry by megabytes
//     of quota, so the worker re-fetches media in CORS mode (the APIs send
//     Access-Control-Allow-Origin: * on /media) and only ever stores non-opaque 200 responses.
//   - Never stored: responses marked no-store or private (patient photos, KYC documents).
//   - Freshness: cache-first. Upload URLs are content-unique (immutable); for other names the
//     cached copy is shown and refreshed in the background.
//   - Bounded: at most MEDIA_MAX_ENTRIES files; the oldest entries are dropped first.
//
// Canonical copy: shared/shared-ui-lib/pwa/sw-media.js. Keep every app's public/sw-media.js
// identical to it.

const MEDIA_CACHE = 'cv-media-v1';
const MEDIA_MAX_ENTRIES = 400;
const MEDIA_HOST = /(^|\.)codevertexafrica\.com$/;

function isMediaRequest(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin === self.location.origin) return url.pathname === '/_next/image';
  return MEDIA_HOST.test(url.hostname) && url.pathname.startsWith('/media/');
}

function storable(response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return false;
  const cc = (response.headers.get('Cache-Control') || '').toLowerCase();
  return !cc.includes('no-store') && !cc.includes('private');
}

async function trimMediaCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MEDIA_MAX_ENTRIES;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}

async function fetchMedia(request, url) {
  if (url.origin === self.location.origin) return fetch(request);
  try {
    // CORS so the response is readable and cacheable (not opaque); no cookies to the API.
    return await fetch(new Request(url.href, { mode: 'cors', credentials: 'omit' }));
  } catch {
    return fetch(request); // API not sending CORS yet: plain load, not cached
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (!isMediaRequest(request, url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(MEDIA_CACHE);
      const cached = await cache.match(url.href);
      const refresh = async () => {
        const fresh = await fetchMedia(request, url);
        if (storable(fresh)) {
          await cache.put(url.href, fresh.clone());
          await trimMediaCache(cache);
        }
        return fresh;
      };
      if (cached) {
        const immutable = (cached.headers.get('Cache-Control') || '').includes('immutable');
        if (!immutable) event.waitUntil(refresh().catch(() => undefined));
        return cached;
      }
      try {
        return await refresh();
      } catch {
        return Response.error();
      }
    })(),
  );
});
