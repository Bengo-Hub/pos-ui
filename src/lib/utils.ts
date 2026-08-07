import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format an elapsed duration (in milliseconds) as a compact "h m s" string for easy reading —
 * e.g. 5s, 3m 20s, 1h 04m, 2d 3h. Used by KDS/orders age timers, which previously showed raw
 * minutes only (e.g. "32440m ago"), making long waits hard to read.
 */
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, '0')}m`;
  if (mins > 0) return `${mins}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

// Re-exported from @bengo-hub/shared-ui-lib — the single cross-app source of truth (was
// previously duplicated here, in GeneralTab.tsx's own hardcoded <select> list, and again in
// shared-ui-lib's own hotel/facility picker; all three had drifted out of sync with each other).
// The old local `formatCurrency` also hardcoded minimumFractionDigits:2, which is wrong for
// 0-decimal currencies like UGX/RWF/JPY — the shared version fixes that.
export { SUPPORTED_CURRENCIES, CURRENCY_META, formatCurrency, formatCompactCurrency } from '@bengo-hub/shared-ui-lib';
