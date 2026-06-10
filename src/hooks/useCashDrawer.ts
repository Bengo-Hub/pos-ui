'use client';

/**
 * Cash-drawer helper hook. The drawer is wired to a receipt printer and opened by an ESC/POS kick
 * sent to that printer via the QZ Tray bridge (see lib/pos/printer-discovery). This hook reads the
 * outlet's drawer config from POS settings and exposes:
 *   - openDrawer():        manual pop (toolbar "Open Drawer" button)
 *   - autoOpenOnSettle():  pop after a cash/card sale when auto-open is enabled
 *   - canOpen:             whether the drawer is enabled + has a resolvable printer
 *
 * The drawer printer falls back to the Bill/customer station printer when not explicitly set, so a
 * single-printer outlet works with no extra config. Drawer hardware must never block a sale, so the
 * auto-open path is fire-and-forget and swallows failures.
 */

import { useCallback } from 'react';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { openCashDrawer, type DrawerKickCode } from '@/lib/pos/printer-discovery';

export function useCashDrawer() {
  const { data: settings } = usePOSSettings();

  const enabled = settings?.cash_drawer_enabled ?? false;
  const autoOpen = settings?.cash_drawer_auto_open ?? false;
  const kickCode = (settings?.cash_drawer_kick_code ?? 'default') as DrawerKickCode;

  // Resolve the printer the drawer is wired to: explicit setting, else the Bill/customer station.
  const resolvePrinter = useCallback((): string => {
    const explicit = settings?.cash_drawer_printer;
    if (explicit) return explicit;
    const bill = settings?.printer_profiles?.find((p) => p.id === 'customer');
    return bill?.printer_name && bill.printer_name !== 'browser' ? bill.printer_name : '';
  }, [settings]);

  const canOpen = enabled && resolvePrinter() !== '';

  /** Manually pop the drawer. Returns true on success. */
  const openDrawer = useCallback(async (): Promise<boolean> => {
    if (!enabled) return false;
    const printer = resolvePrinter();
    if (!printer) return false;
    return openCashDrawer(printer, kickCode);
  }, [enabled, resolvePrinter, kickCode]);

  /** Pop the drawer after a cash/card settlement when auto-open is on. Fire-and-forget. */
  const autoOpenOnSettle = useCallback((tenderMethod: string) => {
    if (!enabled || !autoOpen) return;
    const isDrawerTender = ['cash', 'card_pdq', 'card_manual', 'pdq', 'card_terminal'].includes(tenderMethod);
    if (!isDrawerTender) return;
    const printer = resolvePrinter();
    if (!printer) return;
    void openCashDrawer(printer, kickCode);
  }, [enabled, autoOpen, resolvePrinter, kickCode]);

  return { enabled, autoOpen, canOpen, openDrawer, autoOpenOnSettle };
}
