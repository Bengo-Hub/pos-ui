'use client';

/**
 * Retail terminal view — GoDigital back-office checkout for the `retail` use case.
 * Barcode-first list view, Retail/Wholesale pricing profile, loyalty, stock badges, hardware scale,
 * manager PIN override on out-of-stock, calculator, keyboard checkout. All wiring comes from the
 * shared TerminalShell + useTerminal(); cfg(retail) drives which controls render.
 */

import { TerminalShell } from '@/components/pos/terminal/parts/terminal-shell';

export function RetailTerminalView() {
  return <TerminalShell />;
}
