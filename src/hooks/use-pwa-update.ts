'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Detects a waiting service-worker update (public/sw.js bumps its own cache-busting `VERSION`
 * constant on every release that must force stale bundles out) and lets the UI trigger it.
 * `applyUpdate` posts SKIP_WAITING — sw.js already listens for that message — which activates the
 * waiting worker; its `activate` handler deletes every cache not matching the new VERSION, so
 * stale static/document caches are cleared automatically. The controllerchange listener then
 * reloads the page once the new worker takes control, which re-fetches all in-page data fresh.
 *
 * Deliberately does NOT touch IndexedDB: pos-db.ts holds the offline sales queue (unsynced
 * transactions) and the cache-first catalog/prices store — wiping either on every version bump
 * would risk losing pending offline sales, which is far worse than a stale cached row that the
 * existing 5-minute background refresh (useBackgroundSync) already reconciles.
 */
export function usePWAUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null;
    navigator.serviceWorker.ready.then((reg) => {
      registration = reg;
      if (reg.waiting) { setWaitingWorker(reg.waiting); setUpdateAvailable(true); }
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(w); setUpdateAvailable(true);
          }
        });
      });
    });
    const interval = setInterval(() => { registration?.update().catch(() => {}); }, 60_000);
    const onControllerChange = () => { window.location.reload(); };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      clearInterval(interval);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
  }, [waitingWorker]);

  return { updateAvailable, applyUpdate };
}
