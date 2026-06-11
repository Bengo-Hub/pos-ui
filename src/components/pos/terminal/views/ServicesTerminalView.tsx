'use client';

/**
 * Services terminal view — GoDigital back-office new-sale terminal for the `services` use case
 * (salon · clinic · spa). Card view, pricing profile + loyalty, staff attribution; no order-types,
 * courses, scale or manager override. Wiring comes from the shared TerminalShell + useTerminal();
 * cfg(services) drives which controls render.
 */

import { TerminalShell } from '@/components/pos/terminal/parts/terminal-shell';

export function ServicesTerminalView() {
  return <TerminalShell />;
}
