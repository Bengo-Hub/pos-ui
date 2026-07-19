'use client';

/**
 * Single source of truth for the "own-sales-only" gating used across every sales surface
 * (Tables → My Bills, Orders, All-Sales/POS-Sales list, and the sidebar relabels).
 *
 * Previously this test was duplicated with three DIVERGENT formulas, so the surfaces could
 * disagree about whether a principal saw all vs only their own sales. It is now computed once:
 *
 *   ownOnly = holds view_own but NOT full-view (view/manage)  AND  the outlet's
 *             cashier_sales_visibility policy is not "outlet".
 *
 * Notes:
 *  - Full-view = `pos.orders.view` / `pos.orders.manage` (NOT `change` — a waiter holds change
 *    but is still own-scoped by default; granting `pos.orders.view` is the "super waiter" lever
 *    that flips them to all-bills). This mirrors the server's ownOrdersScope EXACTLY.
 *  - When the outlet is configured (or defaults) to `cashier_sales_visibility === 'outlet'`, a
 *    view_own cashier sees all outlet sales — matching the server, which is the data authority.
 *  - Superusers / platform owners are never own-scoped (usePermissions().can returns true for '*').
 */

import { usePermissions } from '@/hooks/usePermissions';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { P } from '@/lib/rbac/permissions';

export interface OwnScope {
  /** True when the current principal should be restricted to their OWN sales. */
  ownOnly: boolean;
  /** The resolved per-outlet visibility policy ('own' | 'outlet'), for labels/debug. */
  visibility: 'own' | 'outlet' | undefined;
}

export function useOwnScope(): OwnScope {
  const { can, canAny, isSuperuser } = usePermissions();
  const { data: settings } = usePOSSettings();
  const visibility = settings?.cashier_sales_visibility;

  const fullView = isSuperuser || canAny([P.ORDERS_VIEW, P.ORDERS_MANAGE]);
  const ownOnly = !fullView && can(P.ORDERS_VIEW_OWN) && visibility !== 'outlet';

  return { ownOnly, visibility };
}
