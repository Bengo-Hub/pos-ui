/**
 * Helpers over OutletSetting.printer_profiles (see ReceiptTab + lib/api/settings PrinterProfile).
 *
 * Printers are keyed by id: the fixed 'customer' (priced bill receipt) and 'waiter' (order copy),
 * plus one profile per KDS station keyed by the station UUID. Ticket→printer routing therefore
 * follows the SAME KDS category_filter routing the kitchen displays use (see kitchen-bar-print.ts).
 */

import type { PrinterProfile } from '@/lib/api/settings';

/** Fixed non-KDS receipt roles that always exist alongside the per-station printers. */
export const BILL_PROFILE_ID = 'customer';
export const WAITER_PROFILE_ID = 'waiter';

/** Effective paper size for a profile — prefers the new `paper_size`, falls back to legacy
 *  `paper_width`, else 80mm. */
export function paperOf(p?: PrinterProfile | null): string {
  return p?.paper_size ?? p?.paper_width ?? '80mm';
}

/** Look up (or synthesize) the profile for an id. */
export function configFor(
  profiles: PrinterProfile[] | null | undefined,
  id: string,
  label?: string,
): PrinterProfile {
  return (
    (profiles ?? []).find((p) => p.id === id) ??
    { id, label: label ?? id, printer_type: 'none' }
  );
}

export function stationProfile(profiles: PrinterProfile[] | null | undefined, stationId: string): PrinterProfile {
  return configFor(profiles, stationId);
}

/** A profile targets a real (non-browser) printer when it has an assigned device name OR a network IP. */
export function hasRealPrinter(p?: PrinterProfile | null): boolean {
  if (!p) return false;
  const named = Boolean(p.printer_name && p.printer_name.toLowerCase() !== 'browser');
  const networked = p.printer_type === 'network' && Boolean(p.printer_ip);
  return named || networked;
}

/** True when at least one profile targets a real printer (drives silent-per-station vs 3-in-1). */
export function anyRealPrinter(profiles?: PrinterProfile[] | null): boolean {
  return (profiles ?? []).some((p) => hasRealPrinter(p));
}

/** A printer card's own Auto-print toggle allows automatic jobs. A profile saved without the
 *  toggle counts as on (same as pos-api PrinterProfile.AutoPrintEnabled). */
export function autoPrintsOn(p?: PrinterProfile | null): boolean {
  return p?.auto_print !== false;
}

/**
 * The single gate for every AUTOMATIC customer copy the till prints itself (the bill when an order
 * is posted, the receipt when a sale is paid): the outlet's auto_print_order switch AND the bill
 * printer's own Auto-print toggle. Mirrors pos-api printing.AutoBillProfile, so the till and the
 * print agent queue agree. Manual Print Bill / Print Receipt ignore it.
 */
export function autoPrintsCustomerCopy(
  settings?: { auto_print_order?: boolean | null; printer_profiles?: PrinterProfile[] | null } | null,
): boolean {
  if (!settings?.auto_print_order) return false;
  return autoPrintsOn(resolveBillProfile(settings.printer_profiles));
}

/**
 * Resolve the profile the customer bill should print to. Operators often assign a printer only to
 * a kitchen station (or the waiter copy) and leave the Bill card unset — the bill must still reach
 * a real printer instead of "No printer detected". Preference: customer → waiter → any real
 * printer → the raw customer profile (so paper-size etc. still apply to browser fallbacks).
 */
export function resolveBillProfile(profiles?: PrinterProfile[] | null): PrinterProfile {
  const customer = configFor(profiles, BILL_PROFILE_ID);
  if (hasRealPrinter(customer)) return customer;
  const waiter = (profiles ?? []).find((p) => p.id === WAITER_PROFILE_ID);
  if (waiter && hasRealPrinter(waiter)) return waiter;
  const anyReal = (profiles ?? []).find((p) => hasRealPrinter(p));
  return anyReal ?? customer;
}
