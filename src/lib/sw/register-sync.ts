/**
 * Registers the offline-shell service worker (public/sw.js) and a Background Sync tag so the
 * SW retries sync-pos-data when connectivity returns.
 *
 * The SW must be registered explicitly: Next 16 builds with Turbopack, under which
 * @ducanh2912/next-pwa does not run, so nothing auto-registers a worker. Without this the
 * PWA has no offline shell and a reload during an outage shows a blank page.
 *
 * Falls back gracefully where SyncManager is unavailable (iOS Safari, older browsers).
 */
export async function registerBackgroundSync(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  // Don't cache dev assets — only run the offline shell in production builds.
  if (process.env.NODE_ENV !== 'production') return;

  try {
    // Register (or reuse) the offline-shell worker at the app root scope.
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const reg = await navigator.serviceWorker.ready;

    if ('SyncManager' in window) {
      // @ts-expect-error SyncManager types not in all TS libs
      await reg.sync.register('sync-pos-data').catch(() => {});
    }
  } catch {
    // Registration failures are non-fatal — the app still works online, and offline order
    // creation still queues to IndexedDB while the tab stays open.
  }
}
