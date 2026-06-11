'use client';

/**
 * Pharmacy terminal view — GoDigital back-office walk-in sale for the `pharmacy` use case.
 * Barcode-first list view, pricing profile, loyalty, stock badges, hardware scale, manager PIN
 * override on out-of-stock, calculator, keyboard checkout (no order-types/courses). Wiring comes
 * from the shared TerminalShell + useTerminal(); cfg(pharmacy) drives which controls render.
 */

import { TerminalShell } from '@/components/pos/terminal/parts/terminal-shell';

export function PharmacyTerminalView() {
  return <TerminalShell />;
}
