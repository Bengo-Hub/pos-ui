'use client';

import { RefreshCw } from 'lucide-react';
import { usePWAUpdate } from '@/hooks/use-pwa-update';

export function PWAUpdateBanner() {
  const { updateAvailable, applyUpdate } = usePWAUpdate();

  if (!updateAvailable) return null;

  return (
    <div
      className="fixed top-0 inset-x-0 z-[100] flex items-center justify-between gap-3 bg-primary px-4 py-2.5 text-primary-foreground shadow-lg"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 0.625rem)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
        <span className="text-sm font-medium truncate">A new version is available</span>
      </div>
      <button
        onClick={applyUpdate}
        className="shrink-0 rounded-lg bg-primary-foreground/15 px-3 py-1 text-xs font-semibold hover:bg-primary-foreground/25 transition-colors min-h-[32px]"
      >
        Update now
      </button>
    </div>
  );
}
