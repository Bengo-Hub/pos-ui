'use client';

/**
 * Quick-service terminal view — GoDigital back-office terminal for the `quick_service` use case
 * (counter QSR). Card view, order-type selector (dine-in/takeaway), COD allowed, send-to-kitchen on
 * dine-in; no pricing profile/courses/scale. Wiring comes from the shared TerminalShell +
 * useTerminal(); cfg(quick_service) drives which controls render.
 */

import { TerminalShell } from '@/components/pos/terminal/parts/terminal-shell';

export function QuickServiceTerminalView() {
  return <TerminalShell />;
}
