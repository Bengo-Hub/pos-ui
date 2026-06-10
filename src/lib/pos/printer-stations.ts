/**
 * Adapter over the existing OutletSetting.printer_profiles (see ReceiptTab + lib/api/settings
 * PrinterProfile) for the GoDigital "Order Printing Option" stations: Bill, KOT Kitchen, KOT Bar,
 * KOT Coffee Shop. We reuse the existing PrinterProfile shape (id/label/printer_type/printer_name/
 * paper_width/auto_print/categories) — NO new persisted schema — and just map station → profile id.
 */

import type { PrinterProfile } from '@/lib/api/settings';

export type PrintStation = 'bill' | 'kitchen' | 'bar' | 'coffee';

// Station → existing PrinterProfile.id. 'customer' is the long-standing id for the customer/bill
// receipt printer; kitchen/bar/coffee are the KOT stations.
export const STATION_TO_PROFILE_ID: Record<PrintStation, string> = {
  bill: 'customer',
  kitchen: 'kitchen',
  bar: 'bar',
  coffee: 'coffee',
};

export const PRINT_STATIONS: { station: PrintStation; profileId: string; label: string }[] = [
  { station: 'bill', profileId: 'customer', label: 'Bill Print' },
  { station: 'kitchen', profileId: 'kitchen', label: 'KOT Kitchen Print' },
  { station: 'bar', profileId: 'bar', label: 'KOT Bar Print' },
  { station: 'coffee', profileId: 'coffee', label: 'KOT Coffee Shop' },
];

export function configFor(profiles: PrinterProfile[] | null | undefined, station: PrintStation): PrinterProfile {
  const id = STATION_TO_PROFILE_ID[station];
  return (
    (profiles ?? []).find((p) => p.id === id) ??
    { id, label: PRINT_STATIONS.find((s) => s.station === station)?.label ?? id, printer_type: 'none' }
  );
}

export function stationConfigMap(profiles?: PrinterProfile[] | null): Record<PrintStation, PrinterProfile> {
  return {
    bill: configFor(profiles, 'bill'),
    kitchen: configFor(profiles, 'kitchen'),
    bar: configFor(profiles, 'bar'),
    coffee: configFor(profiles, 'coffee'),
  };
}

/** A station has a real (non-browser) assigned printer when printer_name is set, or a network IP. */
export function hasRealPrinter(p?: PrinterProfile | null): boolean {
  if (!p) return false;
  const named = Boolean(p.printer_name && p.printer_name.toLowerCase() !== 'browser');
  const networked = p.printer_type === 'network' && Boolean(p.printer_ip);
  return named || networked;
}

/** Coffee station is "active" (own ticket) only when it has its own printer; else coffee/tea fold
 *  into the kitchen ticket (default rule: coffee & tea go to the kitchen). */
export function coffeeStationActive(profiles?: PrinterProfile[] | null): boolean {
  return hasRealPrinter(configFor(profiles, 'coffee'));
}
