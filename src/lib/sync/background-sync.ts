'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { useSyncOfflineOrders } from '@/hooks/use-sync-offline-orders';
import { useEffectiveOnline, isEffectivelyOnline } from '@/lib/connectivity';
import { refreshAllDatasets } from '@/lib/offline/datasets';
import { refreshStaffProfiles } from '@/lib/offline/staff-profiles';
import { revalidateFullCatalog, useEffectiveOutletID } from '@/hooks/usePOS';
import { registerBackgroundSync } from '@/lib/sw/register-sync';
import { isBackgroundSyncPaused, markCacheRefreshed } from '@/lib/sync/sync-control';

/**
 * THE dedicated background sync job (mounted once in org-shell):
 *
 *  - PUSH every 10s while effectively online: drain the IndexedDB mutation queues
 *    (orders/payments/voids/returns/drawers/eTIMS) — provided by useSyncOfflineOrders,
 *    which also listens for the online event, SW Background Sync wake-ups and the
 *    manual "Sync now" trigger.
 *  - PULL every 5 min: refresh EVERY IndexedDB dataset (settings, tenders, categories,
 *    loyalty, recent orders — see OFFLINE_DATASETS), the staff-profile cache (offline
 *    PIN) and the full catalog. So the terminal keeps operating at IndexedDB speed and
 *    the server and UI stay in sync even on slow connections.
 *  - Immediate pull on reconnect and when the tab becomes visible again (min-gap
 *    guarded so tab-switching doesn't stampede the API).
 *  - Honors the manager pause switch from the sync-monitor page.
 */

export const CACHE_REFRESH_INTERVAL_MS = 5 * 60_000;
/** Visibility/reconnect triggers skip the refresh when one ran more recently than this. */
const MIN_REFRESH_GAP_MS = 60_000;

export function useBackgroundSync(): void {
  const qc = useQueryClient();
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const outletID = useEffectiveOutletID();
  const isOnline = useEffectiveOnline();
  const lastRunRef = useRef(0);
  const runningRef = useRef(false);

  // The push engine: 10s drain interval + online event + SW POS_SYNC + pos:sync-now.
  useSyncOfflineOrders();

  // Register the offline-shell SW + Background Sync tag (idempotent).
  useEffect(() => { registerBackgroundSync(); }, []);

  const refreshCaches = useCallback(async (force = false) => {
    if (!tenantID || runningRef.current) return;
    if (!isEffectivelyOnline() || isBackgroundSyncPaused()) return;
    if (!force && Date.now() - lastRunRef.current < MIN_REFRESH_GAP_MS) return;
    runningRef.current = true;
    lastRunRef.current = Date.now();
    try {
      await refreshAllDatasets(tenantID, outletID || undefined, qc);
      await refreshStaffProfiles(tenantID, outletID || undefined).catch(() => {});
      await revalidateFullCatalog(qc, tenantID, outletID || '');
      markCacheRefreshed();
    } finally {
      runningRef.current = false;
    }
  }, [tenantID, outletID, qc]);

  // 5-minute pull loop (+ immediate warm-up shortly after mount/login).
  useEffect(() => {
    if (!tenantID) return;
    const warmup = setTimeout(() => void refreshCaches(true), 4_000);
    const interval = setInterval(() => void refreshCaches(true), CACHE_REFRESH_INTERVAL_MS);
    return () => { clearTimeout(warmup); clearInterval(interval); };
  }, [tenantID, refreshCaches]);

  // Reconnect → refresh right away (the drain worker already handles the push side).
  useEffect(() => {
    if (isOnline) void refreshCaches();
  }, [isOnline, refreshCaches]);

  // Tab became visible after being backgrounded → catch up (min-gap guarded).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshCaches();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshCaches]);

  // Manual "Refresh caches now" trigger (sync-monitor page).
  useEffect(() => {
    const onTrigger = () => void refreshCaches(true);
    window.addEventListener('pos:refresh-caches', onTrigger);
    return () => window.removeEventListener('pos:refresh-caches', onTrigger);
  }, [refreshCaches]);
}

/** Ask the mounted background sync to refresh all IndexedDB caches now. */
export function triggerCacheRefreshNow(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('pos:refresh-caches'));
}
