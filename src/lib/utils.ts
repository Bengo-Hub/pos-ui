import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Every elapsed timer uses the one YYYY:MM:DD:HH:mm:ss clock in lib/time/elapsed.
export { formatElapsedClock, elapsedMinutes, elapsedParts } from '@/lib/time/elapsed';

// Re-exported from @bengo-hub/shared-ui-lib — the single cross-app source of truth (was
// previously duplicated here, in GeneralTab.tsx's own hardcoded <select> list, and again in
// shared-ui-lib's own hotel/facility picker; all three had drifted out of sync with each other).
// The old local `formatCurrency` also hardcoded minimumFractionDigits:2, which is wrong for
// 0-decimal currencies like UGX/RWF/JPY — the shared version fixes that.
export { SUPPORTED_CURRENCIES, CURRENCY_META, formatCurrency, formatCompactCurrency } from '@bengo-hub/shared-ui-lib';
