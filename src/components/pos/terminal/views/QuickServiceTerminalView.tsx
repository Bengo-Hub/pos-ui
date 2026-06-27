'use client';

/**
 * Quick-service terminal view — GoDigital back-office terminal for the `quick_service` use case
 * (counter QSR). Card view, order-type selector (dine-in/takeaway), COD allowed, send-to-kitchen on
 * dine-in; no pricing profile/courses/scale. Wiring comes from the shared TerminalShell +
 * useTerminal(); cfg(quick_service) drives which controls render.
 */

import { FaceliftShell } from '@/components/pos/terminal/facelift/facelift-shell';

export function QuickServiceTerminalView() {
  // Restaurant-POS facelift, shared with hospitality. Pure restyle over the shared useTerminal()
  // controller — QSR specifics (fast add, dine-in/takeaway order-type, COD, send-to-kitchen on
  // dine-in; no tables/courses) are preserved by the same cfg(quick_service) gating.
  return <FaceliftShell />;
}
