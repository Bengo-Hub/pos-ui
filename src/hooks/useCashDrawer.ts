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
import { openCashDrawerProfile, type DrawerKickCode } from '@/lib/pos/printer-discovery';
import { hasRealPrinter, BILL_PROFILE_ID } from '@/lib/pos/printer-stations';
import type { PrinterProfile } from '@/lib/api/settings';

export function useCashDrawer() {
  const { data: settings } = usePOSSettings();

  const enabled = settings?.cash_drawer_enabled ?? false;
  const autoOpen = settings?.cash_drawer_auto_open ?? false;
  const kickCode = (settings?.cash_drawer_kick_code ?? 'default') as DrawerKickCode;

  // Resolve the printer PROFILE the drawer is wired to: an explicit named printer, else the
  // Customer/Bill station profile (which may be OS/USB/BT by name OR a raw network printer by IP).
  const resolveProfile = useCallback((): PrinterProfile | undefined => {
    const explicit = settings?.cash_drawer_printer;
    if (explicit) return { id: 'drawer', label: 'Drawer', printer_type: 'os', printer_name: explicit };
    return settings?.printer_profiles?.find((p) => p.id === BILL_PROFILE_ID);
  }, [settings]);

  const canOpen = enabled && hasRealPrinter(resolveProfile());

  /** Manually pop the drawer. Returns true on success. */
  const openDrawer = useCallback(async (): Promise<boolean> => {
    if (!enabled) return false;
    const profile = resolveProfile();
    if (!hasRealPrinter(profile)) return false;
    return openCashDrawerProfile(profile, kickCode);
  }, [enabled, resolveProfile, kickCode]);

  /** Pop the drawer after a cash/card settlement when auto-open is on. Fire-and-forget. */
  const autoOpenOnSettle = useCallback((tenderMethod: string) => {
    if (!enabled || !autoOpen) return;
    const isDrawerTender = ['cash', 'card_pdq', 'card_manual', 'pdq', 'card_terminal'].includes(tenderMethod);
    if (!isDrawerTender) return;
    const profile = resolveProfile();
    if (!hasRealPrinter(profile)) return;
    void openCashDrawerProfile(profile, kickCode);
  }, [enabled, autoOpen, resolveProfile, kickCode]);

  return { enabled, autoOpen, canOpen, openDrawer, autoOpenOnSettle };
}
