/**
 * Pure formatting helpers for M-Pesa C2B inbox rows — extracted out of the UI component
 * (c2b-payment-matcher.tsx) so the parsing logic is independently testable and reusable by any
 * future C2B display (e.g. a treasury-ui reconciliation report) without duplicating the format.
 */

/** Daraja's TransTime is "yyyymmddHHMMSS" (e.g. "20260822143205") — parse into a readable local
 *  time. Returns '' for anything that isn't exactly 14 digits or doesn't parse to a valid date. */
export function formatTransTime(raw?: string): string {
  if (!raw || raw.length !== 14 || !/^\d{14}$/.test(raw)) return '';
  const y = raw.slice(0, 4), mo = raw.slice(4, 6), d = raw.slice(6, 8);
  const h = raw.slice(8, 10), mi = raw.slice(10, 12), s = raw.slice(12, 14);
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('en-KE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
}
