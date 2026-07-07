'use client';

/**
 * Shared control state for the background sync engine — split out so both the drain
 * worker (use-sync-offline-orders) and the background refresher/monitor page can import
 * it without a dependency cycle.
 */

const PAUSED_KEY = 'pos_bg_sync_paused';
const LAST_REFRESH_KEY = 'pos_bg_last_cache_refresh';

/** Manager-controlled kill switch (sync-monitor page). Paused = no drain, no cache refresh. */
export function isBackgroundSyncPaused(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(PAUSED_KEY) === '1';
}

export function setBackgroundSyncPaused(paused: boolean): void {
  if (typeof window === 'undefined') return;
  if (paused) localStorage.setItem(PAUSED_KEY, '1');
  else localStorage.removeItem(PAUSED_KEY);
  window.dispatchEvent(new Event('pos:bg-sync-control'));
}

export function getLastCacheRefreshAt(): number | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(LAST_REFRESH_KEY);
  return v ? Number(v) : null;
}

export function markCacheRefreshed(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_REFRESH_KEY, String(Date.now()));
}
