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

/**
 * Currency codes offered by the hotel/facility rate + booking-policy currency pickers
 * (facility-form-modal, hotel/rooms, BookingPolicyTab) — centralised here so the three
 * previously-duplicated `<select>` option lists can never drift out of sync.
 */
export const SUPPORTED_CURRENCIES = ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS'] as const;

/**
 * Format a money amount as the tenant currency (KES by default). Centralised here because the
 * codebase had ~9 separate inline Intl.NumberFormat definitions plus a divergent `money()` helper
 * that emitted "KSh" instead of "KES" — new code should always use this one.
 */
export function formatCurrency(amount: number | null | undefined, currency = 'KES'): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount ?? 0));
}
