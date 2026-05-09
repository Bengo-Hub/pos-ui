/**
 * Registers a Background Sync tag so the service worker will retry
 * sync-pos-data when connectivity is restored — even if the tab is closed.
 *
 * Falls back gracefully if SyncManager is not available (iOS Safari, older browsers).
 */
export async function registerBackgroundSync(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    // @ts-expect-error SyncManager types not in all TS libs
    await reg.sync.register('sync-pos-data');
  } catch {
    // SyncManager registration failures are non-fatal
  }
}
