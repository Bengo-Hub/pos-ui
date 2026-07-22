'use client';

import { cn } from '@/lib/utils';
import { P, usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import {
  BarChart3, ChefHat, ClipboardList, Grid3x3, LayoutDashboard,
  Menu as MenuIcon, Plus,
} from 'lucide-react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { type ComponentType } from 'react';

interface Props {
  /** Opens the full navigation drawer (the sidebar) for the "More" tab. */
  onOpenMenu: () => void;
}

/**
 * MobileBottomNav — app-style bottom navigation for phones/tablets (hidden ≥ lg), ported from
 * inventory-ui's pattern. Gives one-tap access to Home, the two destinations most relevant to the
 * outlet's use case, and a prominent central "+" straight into the POS Terminal (starting a new
 * sale is THE primary action on this app, unlike inventory's multi-option quick-add sheet).
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
    ? { label: 'Tables', href: `${base}/tables`, Icon: Grid3x3, match: (p: string) => p.startsWith(`${base}/tables`), show: hasModule('tables') && allow([P.TABLES_VIEW, P.TABLES_MANAGE]) }
    : { label: 'Orders', href: `${base}/sell/all-sales`, Icon: ClipboardList, match: (p: string) => p.startsWith(`${base}/sell/all-sales`), show: allow([P.ORDERS_ADD, P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE, P.ORDERS_VIEW_OWN, P.REPORTS_VIEW]) };
  const rightTab = isFood
    ? { label: 'KDS', href: `${base}/kds`, Icon: ChefHat, match: (p: string) => p.startsWith(`${base}/kds`), show: hasModule('kds') && allow([P.KDS_VIEW, P.KDS_CHANGE, P.KDS_MANAGE]) }
    : { label: 'Reports', href: `${base}/reports`, Icon: BarChart3, match: (p: string) => p.startsWith(`${base}/reports`), show: hasModule('reports') && allow([P.REPORTS_VIEW, P.REPORTS_MANAGE]) };
  const homeTab = { label: 'Home', href: base, Icon: LayoutDashboard, match: (p: string) => p === base };

  const canOpenTerminal = isSuperuser || allow([P.ORDERS_ADD]);

  return (
    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5 items-end h-16">
        <Tab {...homeTab} active={homeTab.match(pathname)} />

        {leftTab.show ? <Tab {...leftTab} active={leftTab.match(pathname)} /> : <div aria-hidden />}

        {/* Center elevated "+" — jumps straight into the POS Terminal to start a sale. */}
        <div className="flex items-end justify-center">
          {canOpenTerminal ? (
            <Link
              href={`${base}/order`}
              aria-label="New sale"
              className="mb-2 flex h-14 w-14 -translate-y-3 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 transition-transform"
            >
              <Plus className="h-7 w-7" />
            </Link>
          ) : (
            <div className="mb-2 h-14 w-14 -translate-y-3" aria-hidden />
          )}
        </div>

        {rightTab.show ? <Tab {...rightTab} active={rightTab.match(pathname)} /> : <div aria-hidden />}

        <button
          onClick={onOpenMenu}
          className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground active:text-foreground"
        >
          <MenuIcon className="h-5 w-5" />
          <span className="text-[10px] font-semibold leading-none">More</span>
        </button>
      </div>
    </nav>
  );
}

function Tab({ label, href, Icon, active }: { label: string; href: string; Icon: ComponentType<{ className?: string }>; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex h-full flex-col items-center justify-center gap-1 transition-colors',
        active ? 'text-primary' : 'text-muted-foreground active:text-foreground',
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="max-w-full truncate text-[10px] font-semibold leading-none">{label}</span>
    </Link>
  );
}
