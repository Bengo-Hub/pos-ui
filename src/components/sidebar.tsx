'use client';

import { cn } from '@/lib/utils';
import {
  BarChart3,
  BedDouble,
  Calendar,
  ChefHat,
  ChevronDown,
  ClipboardList,
  Gift,
  TrendingUp,
  Clock,
  Cpu,
  Grid3x3,
  Key,
  LayoutDashboard,
  Lock,
  LogOut,
  Monitor,
  Package,
  Pill,
  Plus,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Utensils,
  Wallet,
  Webhook,
  Wine,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useState } from 'react';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { useAuthStore } from '@/store/auth';
import { useModuleAccess } from '@/hooks/use-module-access';
import { usePermissions } from '@/hooks/usePermissions';
import { useSubscription } from '@/hooks/use-subscription';
import { P } from '@/lib/rbac/permissions';
import type { Permission } from '@/lib/rbac/permissions';

const SUBSCRIBE_URL = process.env.NEXT_PUBLIC_SUBSCRIPTIONS_UI_URL || 'https://pricing.codevertexitsolutions.com';

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

// ── Nav item type ─────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  moduleKey: string;
  /** At least one of these permissions must be held */
  permission?: Permission | Permission[];
  /** Subscription feature code — shows upgrade lock badge if not in plan */
  subFeature?: string;
  /** Human-readable plan label shown in the lock badge, e.g. "Pro" */
  subPlan?: string;
}

interface NavGroup {
  label: string;
  /** If true, this group starts collapsed by default (unless it has the active route). */
  defaultCollapsed?: boolean;
  items: NavItem[];
}

// ── Nav link ──────────────────────────────────────────────────────────────────

function NavLink({ item, orgSlug, onClose, locked, subPlan }: {
  item: NavItem;
  orgSlug: string;
  onClose?: () => void;
  locked?: boolean;
  subPlan?: string;
}) {
  const pathname = usePathname();
  const href = `/${orgSlug}${item.href}`;
  const active =
    item.href === '/dashboard'
      ? pathname === href
      : pathname.startsWith(href);
  const Icon = item.icon;

  if (locked) {
    return (
      <a
        href={`${SUBSCRIBE_URL}/subscribe`}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm text-sidebar-foreground/35 hover:text-sidebar-foreground/55 hover:bg-sidebar-foreground/5 font-medium"
      >
        <Icon className="h-4.5 w-4.5 shrink-0 opacity-50" />
        <span className="truncate flex-1">{item.label}</span>
        <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-500 border border-amber-500/20 shrink-0">
          <Lock className="h-2.5 w-2.5" />
          {subPlan ?? 'Pro'}
        </span>
      </a>
    );
  }

  return (
    <Link
      href={href}
      onClick={onClose}
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm',
        active
          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 font-semibold'
          : 'text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-foreground/8 font-medium'
      )}
    >
      <Icon className={cn('h-4.5 w-4.5 shrink-0 transition-transform duration-200', !active && 'group-hover:scale-110')} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

// ── Collapsible group ─────────────────────────────────────────────────────────

function NavGroupSection({
  group,
  orgSlug,
  onClose,
  initialOpen,
  lockedFeatures,
}: {
  group: NavGroup & { items: NavItem[] };
  orgSlug: string;
  onClose?: () => void;
  initialOpen: boolean;
  lockedFeatures: Set<string>;
}) {
  const [open, setOpen] = useState(initialOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 mb-1 py-0.5 group/header"
        aria-expanded={open}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/35 group-hover/header:text-sidebar-foreground/50 transition-colors">
          {group.label}
        </span>
        <ChevronDown
          className={cn(
            'h-3 w-3 text-sidebar-foreground/30 transition-all duration-200 group-hover/header:text-sidebar-foreground/50',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && (
        <div className="space-y-0.5">
          {group.items.map((item) => {
            const locked = !!item.subFeature && lockedFeatures.has(item.subFeature);
            return (
              <NavLink
                key={item.href + item.label}
                item={item}
                orgSlug={orgSlug}
                onClose={onClose}
                locked={locked}
                subPlan={item.subPlan}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const params = useParams();
  const pathname = usePathname();
  const orgSlug = params?.orgSlug as string;
  const { tenant } = useTenantBranding();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const { hasModule, isSuperUser } = useModuleAccess();
  const { canAny, isSuperuser } = usePermissions();
  const { hasFeature, isActive, isPlatformOwner: isSubPlatform } = useSubscription();
  const isPlatformOwner = isSuperuser || isSuperUser || isSubPlatform || orgSlug === 'codevertex';

  // ── Nav groups ────────────────────────────────────────────────────────────

  const navGroups: NavGroup[] = [
    {
      label: 'Operations',
      items: [
        { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', moduleKey: 'dashboard' },
        { label: 'New Order', icon: Plus, href: '/order', moduleKey: 'new_order', permission: P.ORDERS_ADD },
        { label: 'Orders', icon: ClipboardList, href: '/orders', moduleKey: 'orders', permission: [P.ORDERS_VIEW, P.ORDERS_VIEW_OWN] },
        { label: 'Cash Drawer', icon: Wallet, href: '/drawer', moduleKey: 'cash_drawer', permission: [P.DRAWERS_ADD, P.DRAWERS_MANAGE, P.DRAWERS_VIEW_OWN] },
        { label: 'Retail', icon: ShoppingCart, href: '/retail', moduleKey: 'retail', permission: [P.ORDERS_ADD, P.ORDERS_VIEW] },
        { label: 'Layaway', icon: Package, href: '/layaway', moduleKey: 'layaway', permission: [P.ORDERS_VIEW, P.ORDERS_ADD], subFeature: 'layaway', subPlan: 'Growth' },
        { label: 'Shifts', icon: Clock, href: '/shifts', moduleKey: 'shifts', permission: [P.SESSIONS_ADD, P.SESSIONS_VIEW, P.SESSIONS_VIEW_OWN], subFeature: 'shift_reports', subPlan: 'Pro' },
      ],
    },
    {
      label: 'Floor & Service',
      items: [
        { label: 'Tables', icon: Grid3x3, href: '/tables', moduleKey: 'tables', permission: [P.TABLES_VIEW, P.TABLES_MANAGE], subFeature: 'table_management', subPlan: 'Pro' },
        { label: 'Appointments', icon: Calendar, href: '/appointments', moduleKey: 'appointments', permission: [P.ORDERS_VIEW, P.HOTEL_VIEW] },
      ],
    },
    {
      label: 'Kitchen & Bar',
      defaultCollapsed: true,
      items: [
        { label: 'KDS', icon: ChefHat, href: '/kds', moduleKey: 'kds', permission: [P.ORDERS_VIEW, P.ORDERS_MANAGE] },
        { label: 'Bar Display', icon: Wine, href: '/bar', moduleKey: 'kds', permission: [P.ORDERS_VIEW, P.ORDERS_MANAGE] },
        { label: 'Menu', icon: Utensils, href: '/order', moduleKey: 'new_order', permission: P.CATALOG_VIEW },
      ],
    },
    {
      label: 'Hotel',
      defaultCollapsed: true,
      items: [
        { label: 'Rooms', icon: BedDouble, href: '/hotel/rooms', moduleKey: 'hotel', permission: [P.HOTEL_VIEW, P.HOTEL_MANAGE] },
        { label: 'Facilities', icon: Cpu, href: '/hotel/facilities', moduleKey: 'hotel', permission: [P.HOTEL_VIEW, P.HOTEL_MANAGE] },
      ],
    },
    {
      label: 'Online Orders',
      defaultCollapsed: true,
      items: [
        { label: 'Pickup Queue', icon: ShoppingBag, href: '/online-orders', moduleKey: 'online_orders', permission: [P.ORDERS_VIEW, P.ORDERS_MANAGE], subFeature: 'online_orders', subPlan: 'Pro' },
      ],
    },
    {
      label: 'Pharmacy',
      defaultCollapsed: true,
      items: [
        { label: 'Prescriptions', icon: Pill, href: '/pharmacy', moduleKey: 'pharmacy', permission: [P.ORDERS_VIEW, P.ORDERS_ADD] },
      ],
    },
    {
      label: 'Management',
      defaultCollapsed: true,
      items: [
        { label: 'Reports', icon: BarChart3, href: '/reports', moduleKey: 'reports', permission: [P.REPORTS_VIEW, P.REPORTS_MANAGE], subFeature: 'shift_reports', subPlan: 'Pro' },
        { label: 'Loyalty', icon: Gift, href: '/loyalty', moduleKey: 'loyalty', permission: [P.ORDERS_VIEW, P.ORDERS_ADD], subFeature: 'loyalty', subPlan: 'Growth' },
        { label: 'Commissions', icon: TrendingUp, href: '/commissions', moduleKey: 'commissions', permission: [P.ORDERS_VIEW, P.ORDERS_MANAGE], subFeature: 'commissions', subPlan: 'Pro' },
        { label: 'Webhooks', icon: Webhook, href: '/webhooks', moduleKey: 'settings', permission: [P.CONFIG_VIEW, P.CONFIG_MANAGE], subFeature: 'webhooks', subPlan: 'Growth' },
        { label: 'Settings', icon: Settings, href: '/settings', moduleKey: 'settings', permission: [P.CONFIG_VIEW, P.CONFIG_CHANGE, P.CONFIG_MANAGE] },
      ],
    },
  ];

  // ── Filter by module + permission; subscription features shown but locked ───

  // Collect which subFeature codes are locked (not in the current plan).
  // Platform owners and superusers bypass all subscription gates.
  const lockedFeatures = new Set<string>();
  if (!isPlatformOwner && isActive !== undefined) {
    navGroups.forEach((g) =>
      g.items.forEach((item) => {
        if (item.subFeature && !hasFeature(item.subFeature)) {
          lockedFeatures.add(item.subFeature);
        }
      })
    );
  }

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!hasModule(item.moduleKey)) return false;
        if (!item.permission) return true;
        if (isSuperuser || isSuperUser) return true;
        const perms = Array.isArray(item.permission) ? item.permission : [item.permission];
        return canAny(perms);
      }),
    }))
    .filter((g) => g.items.length > 0);

  // Groups that contain the current active route are auto-expanded
  function isGroupInitiallyOpen(group: NavGroup): boolean {
    if (!group.defaultCollapsed) return true;
    return group.items.some((item) => {
      const href = `/${orgSlug}${item.href}`;
      return item.href === '/dashboard' ? pathname === href : pathname?.startsWith(href);
    });
  }

  // ── User display ──────────────────────────────────────────────────────────

  const displayName = user?.fullName || tenant?.name || orgSlug;
  const displayInitial = displayName?.[0]?.toUpperCase() ?? '?';
  const primaryRole = (user?.roles ?? [])[0];
  const roleLabel =
    primaryRole === 'admin' || primaryRole === 'pos_admin' ? 'Admin'
    : primaryRole === 'manager' || primaryRole === 'store_manager' ? 'Manager'
    : primaryRole
      ? primaryRole.charAt(0).toUpperCase() + primaryRole.slice(1)
      : 'Staff';

  // ── Content ───────────────────────────────────────────────────────────────

  const content = (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      {/* Logo / tenant — constrained to sidebar header band; object-contain prevents overflow */}
      <div className="border-b border-sidebar-border shrink-0 overflow-hidden flex items-center justify-center" style={{ height: '72px' }}>
        {tenant?.logoUrl ? (
          <img
            src={tenant.logoUrl}
            alt={tenant.name ?? orgSlug}
            className="max-h-full w-auto object-contain px-4"
          />
        ) : (
          <div className="flex items-center gap-3 h-full px-4">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <span className="text-sm font-bold text-primary-foreground">
                {(tenant?.orgName ?? orgSlug).slice(0, 2).toUpperCase()}
              </span>
            </div>
            <span className="text-sm font-bold text-sidebar-foreground truncate">
              {tenant?.orgName ?? orgSlug}
            </span>
          </div>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-hide">
        {visibleGroups.map((group) => (
          <NavGroupSection
            key={group.label}
            group={group}
            orgSlug={orgSlug}
            onClose={onClose}
            initialOpen={isGroupInitiallyOpen(group)}
            lockedFeatures={lockedFeatures}
          />
        ))}

        {/* Platform section — always expanded, superuser only */}
        {isPlatformOwner && (
          <div>
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/25">
              Platform
            </p>
            <div className="space-y-0.5">
              <NavLink item={{ label: 'Devices', icon: Monitor, href: '/platform', moduleKey: 'platform' }} orgSlug={orgSlug} onClose={onClose} />
              <NavLink item={{ label: 'Licenses', icon: Key, href: '/platform?tab=licenses', moduleKey: 'platform' }} orgSlug={orgSlug} onClose={onClose} />
            </div>
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-sidebar-foreground/5">
          <div className="h-8 w-8 rounded-lg bg-primary/25 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">{displayInitial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-sidebar-foreground truncate">{displayName}</p>
            <p className="text-[10px] text-sidebar-foreground/50 mt-0.5">{roleLabel}</p>
          </div>
          <button
            onClick={() => logout()}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-sidebar-foreground/40 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col transition-transform duration-300',
          'lg:sticky lg:top-0 lg:h-screen lg:z-auto lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Mobile header bar */}
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4 lg:hidden bg-sidebar">
          <span className="text-sm font-semibold text-sidebar-foreground">Menu</span>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-foreground/10 transition-colors"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">{content}</div>
      </aside>
    </>
  );
}
