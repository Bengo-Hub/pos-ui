'use client';

import { useCallback, useEffect, useState } from 'react';

export function usePWAUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;

    navigator.serviceWorker.ready.then((reg) => {
      registration = reg;

      // Waiting worker already present on mount (e.g., page refreshed after update installed)
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setUpdateAvailable(true);
      }

      // New worker found during this session
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setUpdateAvailable(true);
          }
        });
      });
    });

    // Poll for updates every 60 s so long-running sessions catch deploys
    const interval = setInterval(() => {
      registration?.update().catch(() => { /* offline — ignore */ });
    }, 60_000);

    // Reload all tabs when the new SW takes control (after skipWaiting)
    const onControllerChange = () => {
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      clearInterval(interval);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
    // controllerchange listener above will reload once the new SW takes over
  }, [waitingWorker]);

  return { updateAvailable, applyUpdate };
}
