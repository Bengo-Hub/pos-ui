/// <reference lib="webworker" />
//
// Custom service-worker code injected into the next-pwa (Workbox) service worker.
// Its job is the Background Sync bridge: when the browser fires the `sync` event for our
// `sync-pos-data` tag (registered in src/lib/sw/register-sync.ts), wake any open client and
// ask it to drain the offline queues. The in-page worker (use-sync-offline-orders) listens
// for the POS_SYNC message and runs the actual replay (it owns auth + the API client).
//
// Note: if NO client is open (tab fully closed), this only ensures the drain happens the
// moment the app is next focused — a full headless drain would require reimplementing the
// authenticated replay inside the SW, which is intentionally out of scope.

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-pos-data') {
    event.waitUntil(
      self.clients
        .matchAll({ includeUncontrolled: true, type: 'window' })
        .then((clients) => {
          clients.forEach((client) => client.postMessage({ type: 'POS_SYNC' }));
        }),
    );
  }
});

// Periodic Background Sync (Chromebook/Android kiosk installs) — same bridge.
self.addEventListener('periodicsync', (event: any) => {
  if (event.tag === 'sync-pos-data') {
    event.waitUntil(
      self.clients
        .matchAll({ includeUncontrolled: true, type: 'window' })
        .then((clients) => {
          clients.forEach((client) => client.postMessage({ type: 'POS_SYNC' }));
        }),
    );
  }
});

export {};
