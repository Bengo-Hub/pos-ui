'use client';

import { P, usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { BarChart3, ChefHat, ClipboardList, Grid3x3, LayoutDashboard, Plus } from 'lucide-react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { MobileBottomNav as SharedMobileBottomNav, type MobileNavTab } from '@bengo-hub/shared-ui-lib/navigation';

interface Props {
  /** Opens the full navigation drawer (the sidebar) for the "More" tab. */
  onOpenMenu: () => void;
}

/**
 * MobileBottomNav — app-style bottom navigation for phones/tablets (hidden ≥ lg). Owns pos-ui's
 * specific tab selection (Home, the two destinations most relevant to the outlet's use case, and
 * a prominent central "+" straight into the POS Terminal — starting a new sale is THE primary
 * action on this app) and permission gating, delegating layout/rendering to shared-ui-lib's
 * MobileBottomNav shell (itself extracted from an earlier version of this same file).
 */
export function MobileBottomNav({ onOpenMenu }: Props) {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const pathname = usePathname() ?? '';
  const { canAny, isSuperuser } = usePermissions();
  const { hasModule, isHospitality, isQuickService } = useModuleAccess();
  const isFood = isHospitality || isQuickService;

  const base = `/${orgSlug}`;
  const allow = (perms: string[]) => isSuperuser || canAny(perms);

  const leftTab = isFood
    ? { key: 'tables', label: 'Tables', href: `${base}/tables`, icon: Grid3x3, match: (p: string) => p.startsWith(`${base}/tables`), show: hasModule('tables') && allow([P.TABLES_VIEW, P.TABLES_MANAGE]) }
    : { key: 'orders', label: 'Orders', href: `${base}/sell/all-sales`, icon: ClipboardList, match: (p: string) => p.startsWith(`${base}/sell/all-sales`), show: allow([P.ORDERS_ADD, P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE, P.ORDERS_VIEW_OWN, P.REPORTS_VIEW]) };
  const rightTab = isFood
    ? { key: 'kds', label: 'KDS', href: `${base}/kds`, icon: ChefHat, match: (p: string) => p.startsWith(`${base}/kds`), show: hasModule('kds') && allow([P.KDS_VIEW, P.KDS_CHANGE, P.KDS_MANAGE]) }
    : { key: 'reports', label: 'Reports', href: `${base}/reports`, icon: BarChart3, match: (p: string) => p.startsWith(`${base}/reports`), show: hasModule('reports') && allow([P.REPORTS_VIEW, P.REPORTS_MANAGE]) };
  const homeTab = { key: 'home', label: 'Home', href: base, icon: LayoutDashboard, match: (p: string) => p === base };

  const canOpenTerminal = isSuperuser || allow([P.ORDERS_ADD]);

  const tabs: MobileNavTab[] = [
    { key: homeTab.key, label: homeTab.label, href: homeTab.href, icon: homeTab.icon, active: homeTab.match(pathname) },
    ...(leftTab.show ? [{ key: leftTab.key, label: leftTab.label, href: leftTab.href, icon: leftTab.icon, active: leftTab.match(pathname) }] : []),
    ...(rightTab.show ? [{ key: rightTab.key, label: rightTab.label, href: rightTab.href, icon: rightTab.icon, active: rightTab.match(pathname) }] : []),
  ];

  return (
    <SharedMobileBottomNav
      tabs={tabs}
      centerAction={canOpenTerminal ? { label: 'New sale', href: `${base}/order`, icon: Plus } : undefined}
      onOpenMore={onOpenMenu}
      LinkComponent={Link}
    />
  );
}
