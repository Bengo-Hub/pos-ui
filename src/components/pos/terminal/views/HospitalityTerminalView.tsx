'use client';

/**
 * Hospitality terminal view — GoDigital chrome for sit-down hospitality / hotel use cases.
 * Keeps the hospitality-specific workflow within the same shell: order-type selector + table
 * assign/release (from URL ?table_id), per-item courses + Fire-Courses, fire-to-kitchen
 * (send-to-kitchen mode with kitchen/bar ticket printing), room charge (via the inline payment bar),
 * add-to-bill and the order-placed dialog. All wiring comes from the shared TerminalShell +
 * useTerminal(); cfg(hospitality) drives which controls render.
 */

import { TerminalShell } from '@/components/pos/terminal/parts/terminal-shell';

export function HospitalityTerminalView() {
  return <TerminalShell />;
}
