'use client';

import { usePOSSettings } from '@/hooks/usePOSSettings';
import { usePermissions, P } from '@/hooks/usePermissions';

/**
 * True when the current user must not see profit or margin: the outlet's "hide profit and margin
 * from cashiers" quick config (Settings > Cashier policy) is on AND the user is not manager-tier
 * (lacks pos.orders.manage). Same rule as the Drafts Delete/Resume toggles. pos-api enforces it
 * too (middleware.HideProfitForCashier strips the figures), so this only decides what to render.
 * While the settings load, a non-manager is treated as hidden so the columns never flash as zeros.
 */
export function useHideProfit(): boolean {
  const { can } = usePermissions();
  const { data: settings, isLoading } = usePOSSettings();
  if (can(P.ORDERS_MANAGE)) return false;
  if (isLoading) return true;
  return !!settings?.hide_profit_margin_for_cashier;
}
