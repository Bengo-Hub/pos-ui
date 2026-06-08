'use client';

import { useModuleAccess } from '@/hooks/use-module-access';
import { useSubscription } from '@/hooks/use-subscription';
import { usePermissions } from '@/hooks/usePermissions';
import { isPlatformOwner as checkPlatformOwner } from '@/lib/auth/permissions';
import type { Permission } from '@/lib/rbac/permissions';
import { P } from '@/lib/rbac/permissions';
import { cn } from '@/lib/utils';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { useAuthStore } from '@/store/auth';
import {
  BarChart3,
  BedDouble,
  Calendar,
  ChefHat,
  ChevronDown,
  ClipboardList,
  Clock,
  Cpu,
  Presentation,
  Wine,
  FlaskConical,
  Gift,
  Grid3x3,
  LayoutDashboard,
  Lock,
  LogOut,
  Monitor,
  Package,
  Pill,
  Plus,
  RotateCcw,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sofa,
  TrendingUp,
  Truck,
  UserSquare,
  Users,
  Wallet,
  X
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useState } from 'react';
import { OutletSwitcher } from './outlet-switcher';

const SUBSCRIBE_URL = process.env.NEXT_PUBLIC_SUBSCRIPTIONS_UI_URL || 'https://pricing.codevertexitsolutions.com';
const INVENTORY_URL = process.env.NEXT_PUBLIC_INVENTORY_UI_URL || 'https://inventory.codevertexitsolutions.com';

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
  /** Hidden for waiter role — waiter sees Tables + Shifts only */
  waiterHidden?: boolean;
  /** Hidden for cashier in hospitality/quick_service — they work from the Orders page only */
  cashierHospHidden?: boolean;
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
  const isExternal = item.href.startsWith('http://') || item.href.startsWith('https://');
  const href = isExternal ? item.href : `/${orgSlug}${item.href}`;
  const active = isExternal
    ? false
    : item.href === '/dashboard'
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

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClose}
        className="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-foreground/8 font-medium"
      >
        <Icon className="h-4.5 w-4.5 shrink-0 group-hover:scale-110 transition-transform duration-200" />
        <span className="truncate flex-1">{item.label}</span>
        <svg className="h-3 w-3 shrink-0 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
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
  const { hasModule, isSuperUser, isResolved } = useModuleAccess();
  const { canAny, isSuperuser } = usePermissions();
  const { hasFeature, isActive } = useSubscription();
  // Platform-owner-only (device fleet, platform config, licensing). A tenant `admin` is
  // NOT a platform owner — only the is_platform_owner claim, the superuser role, or the
  // codevertex tenant (verified via the server-returned tenant slug, not the URL) qualifies.
  const isPlatformOwner = checkPlatformOwner(user);

  // HQ users (admin/manager/superuser) can switch between outlets; everyone else is locked to their outlet.
  const userRoles = user?.roles ?? [];
  const isHQUser = isPlatformOwner || userRoles.some((r) => ['admin', 'pos_admin', 'manager', 'store_manager', 'superuser', 'super_admin'].includes(r));

  const outlet = useAuthStore((s) => s.outlet);
  const outletUseCase = (outlet?.use_case ?? (user as any)?.outlet_use_case ?? '').toLowerCase();
  const isServices = outletUseCase === 'services';
  const isPharmacy = outletUseCase === 'pharmacy';
  const isRetail = outletUseCase === 'retail';
  const isHospOrQSR = ['hospitality', 'quick_service'].includes(outletUseCase);

  // ── Nav groups ────────────────────────────────────────────────────────────

  const isWaiter = !isHQUser && userRoles.includes('waiter');
  const isCashierHospOrQSR = !isHQUser && userRoles.includes('cashier') && ['hospitality', 'quick_service'].includes(outletUseCase);

  const navGroups: NavGroup[] = [
    {
      label: 'Operations',
      items: [
        { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', moduleKey: 'dashboard', waiterHidden: true },
        // Waiters who settle bills run their own cash float, so they need the drawer.
        { label: 'Cash Drawer', icon: Wallet, href: '/drawer', moduleKey: 'cash_drawer', permission: [P.DRAWERS_ADD, P.DRAWERS_MANAGE, P.DRAWERS_VIEW_OWN] },
        { label: 'Clients', icon: Users, href: '/clients', moduleKey: 'clients', permission: [P.CLIENTS_VIEW, P.CLIENTS_MANAGE], waiterHidden: true },
        { label: isWaiter ? 'My Shifts' : 'Shifts', icon: Clock, href: '/shifts', moduleKey: 'shifts', permission: [P.SESSIONS_ADD, P.SESSIONS_VIEW, P.SESSIONS_VIEW_OWN], subFeature: 'shift_reports', subPlan: 'Pro', cashierHospHidden: true },
      ],
    },
    {
      // "Sell" groups every sale-entry surface — the fast POS terminal AND back-office sales
      // (mirrors godigital's Sell module). Each item keeps its own use_case/role/feature gating;
      // future: Add Sale (full form), Quotations (treasury S2S), Drafts, Shipments, Discounts, Import.
      label: 'Sell',
      items: [
        { label: 'POS Terminal', icon: Plus, href: '/order', moduleKey: 'new_order', permission: P.ORDERS_ADD, waiterHidden: true, cashierHospHidden: true },
        { label: 'Retail POS', icon: ShoppingCart, href: '/retail', moduleKey: 'retail', permission: P.ORDERS_ADD, waiterHidden: true },
        // All sales (the sale/order list) — add/change or reports access; excludes kitchen/bar (KDS-only view).
        { label: 'All Sales', icon: ClipboardList, href: '/orders', moduleKey: 'orders', permission: [P.ORDERS_ADD, P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE, P.ORDERS_VIEW_OWN, P.REPORTS_VIEW], waiterHidden: true },
        { label: 'Layaway', icon: Package, href: '/layaway', moduleKey: 'layaway', permission: [P.ORDERS_ADD, P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE], subFeature: 'layaway', subPlan: 'Growth', waiterHidden: true },
        { label: 'Sell Returns', icon: RotateCcw, href: '/returns', moduleKey: 'returns', permission: [P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE], waiterHidden: true },
      ],
    },
    {
      label: 'Floor & Service',
      items: [
        { label: 'Tables', icon: Grid3x3, href: '/tables', moduleKey: 'tables', permission: [P.TABLES_VIEW, P.TABLES_MANAGE], subFeature: 'table_management', subPlan: 'Pro', cashierHospHidden: true },
        { label: 'Reservations', icon: Calendar, href: '/reservations', moduleKey: 'reservations', permission: [P.TABLES_VIEW, P.TABLES_MANAGE], waiterHidden: true },
        { label: 'Appointments', icon: Calendar, href: '/appointments', moduleKey: 'appointments', permission: [P.APPOINTMENTS_VIEW, P.APPOINTMENTS_ADD, P.APPOINTMENTS_CHANGE, P.APPOINTMENTS_MANAGE], waiterHidden: true },
        { label: 'Service Packages', icon: Package, href: '/packages', moduleKey: 'packages', permission: [P.PACKAGES_VIEW, P.PACKAGES_MANAGE], waiterHidden: true },
        { label: 'Walk-in Queue', icon: ClipboardList, href: '/queue', moduleKey: 'queue', permission: [P.QUEUE_VIEW, P.QUEUE_CHANGE, P.QUEUE_MANAGE], waiterHidden: true },
        { label: 'Staff Schedule', icon: Users, href: '/staff-schedule', moduleKey: 'staff_schedule', permission: [P.STAFF_VIEW, P.STAFF_MANAGE], waiterHidden: true },
        { label: 'Resources', icon: Sofa, href: '/resources', moduleKey: 'resources', permission: [P.CONFIG_VIEW], waiterHidden: true },
      ],
    },
    {
      label: 'Display Board',
      defaultCollapsed: true,
      items: [
        // Waiters get read-only KDS (P.KDS_VIEW) to see what's ready to serve/hand off.
        { label: 'KDS', icon: ChefHat, href: '/kds', moduleKey: 'kds', permission: [P.KDS_VIEW, P.KDS_CHANGE, P.KDS_MANAGE] },
      ],
    },
    {
      label: 'Hotel',
      defaultCollapsed: true,
      items: [
        { label: 'Hotel Overview', icon: LayoutDashboard, href: '/hotel', moduleKey: 'hotel', permission: [P.HOTEL_VIEW, P.HOTEL_MANAGE], subFeature: 'hotel_module', subPlan: 'Pro', waiterHidden: true },
        { label: 'Rooms', icon: BedDouble, href: '/hotel/rooms', moduleKey: 'hotel', permission: [P.HOTEL_VIEW, P.HOTEL_MANAGE], subFeature: 'hotel_module', subPlan: 'Pro', waiterHidden: true },
        { label: 'Bookings', icon: Users, href: '/hotel/bookings', moduleKey: 'hotel', permission: [P.HOTEL_VIEW, P.HOTEL_MANAGE], subFeature: 'hotel_module', subPlan: 'Pro', waiterHidden: true },
        { label: 'Facilities', icon: Cpu, href: '/hotel/facilities', moduleKey: 'hotel', permission: [P.HOTEL_VIEW, P.HOTEL_MANAGE], subFeature: 'hotel_module', subPlan: 'Pro', waiterHidden: true },
        { label: 'Conferences', icon: Presentation, href: '/hotel/conference', moduleKey: 'hotel', permission: [P.CONFERENCE_VIEW, P.CONFERENCE_MANAGE, P.HOTEL_MANAGE], subFeature: 'conference_events', subPlan: 'Pro', waiterHidden: true },
        { label: 'Happy Hour', icon: Wine, href: '/hotel/happy-hour', moduleKey: 'hotel', permission: [P.PROMOTIONS_VIEW, P.PROMOTIONS_MANAGE, P.HOTEL_MANAGE], subFeature: 'happy_hour', subPlan: 'Pro', waiterHidden: true },
      ],
    },
    {
      label: 'Online Orders',
      defaultCollapsed: true,
      items: [
        // Waiters handle pickup hand-off + delivery rider assignment (P.ORDERS_CHANGE).
        { label: 'Pickup Queue', icon: ShoppingBag, href: '/online-orders', moduleKey: 'online_orders', permission: [P.ORDERS_MANAGE, P.ORDERS_CHANGE, P.QUEUE_MANAGE], subFeature: 'online_orders', subPlan: 'Pro' },
      ],
    },
    {
      label: 'Pharmacy',
      defaultCollapsed: true,
      items: [
        { label: 'Prescriptions', icon: Pill, href: '/pharmacy', moduleKey: 'pharmacy', permission: [P.PHARMACY_VIEW, P.PHARMACY_ADD, P.PHARMACY_CHANGE, P.PHARMACY_MANAGE], waiterHidden: true },
        { label: 'Patient Profiles', icon: UserSquare, href: '/patients', moduleKey: 'patients', permission: [P.PHARMACY_VIEW, P.PHARMACY_MANAGE], waiterHidden: true },
        { label: 'Drug Inventory', icon: FlaskConical, href: '/drug-inventory', moduleKey: 'drug_inventory', permission: [P.PHARMACY_VIEW, P.PHARMACY_MANAGE, P.CATALOG_MANAGE], waiterHidden: true },
      ],
    },
    {
      label: 'Inventory',
      defaultCollapsed: true,
      items: [
        { label: 'Purchase Orders', icon: Truck, href: '/purchase-orders', moduleKey: 'purchase_orders', permission: [P.CATALOG_MANAGE, P.CATALOG_CHANGE], waiterHidden: true },
        { label: 'Manage Inventory', icon: Truck, href: `${INVENTORY_URL}/${orgSlug}`, moduleKey: 'inventory', permission: [P.CATALOG_MANAGE, P.CATALOG_CHANGE], waiterHidden: true },
      ],
    },
    {
      label: 'Management',
      defaultCollapsed: true,
      items: [
        { label: 'Reports', icon: BarChart3, href: '/reports', moduleKey: 'reports', permission: [P.REPORTS_VIEW, P.REPORTS_MANAGE], subFeature: 'shift_reports', subPlan: 'Pro', waiterHidden: true },
        { label: 'Most Profitable', icon: TrendingUp, href: '/reports/most-profitable', moduleKey: 'reports', permission: [P.REPORTS_VIEW, P.REPORTS_MANAGE], subFeature: 'shift_reports', subPlan: 'Pro', waiterHidden: true },
        { label: 'Loyalty', icon: Gift, href: '/loyalty', moduleKey: 'loyalty', permission: [P.LOYALTY_VIEW, P.LOYALTY_ADD, P.LOYALTY_MANAGE], subFeature: 'loyalty', subPlan: 'Growth', waiterHidden: true, cashierHospHidden: true },
        { label: 'Commissions', icon: TrendingUp, href: '/commissions', moduleKey: 'commissions', permission: [P.COMMISSIONS_VIEW, P.COMMISSIONS_VIEW_OWN, P.COMMISSIONS_MANAGE], subFeature: 'commissions', subPlan: 'Pro', waiterHidden: true },
        { label: 'Settings', icon: Settings, href: '/settings', moduleKey: 'settings', permission: [P.CONFIG_VIEW, P.CONFIG_CHANGE, P.CONFIG_MANAGE], waiterHidden: true },
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
      items: group.items
        .filter((item) => {
          if (!hasModule(item.moduleKey)) return false;
          // Waiter role: only Tables + Shifts
          if (isWaiter && item.waiterHidden) return false;
          // Cashier in hospitality/quick_service: focused on clearing bills only
          if (isCashierHospOrQSR && item.cashierHospHidden) return false;
          // Services outlets: hide order-entry items (they use Appointments/Queue instead)
          if (isServices && ['new_order', 'orders'].includes(item.moduleKey)) return false;
          // Retail outlets use Retail POS page, not the hospitality New Order flow
          if (isRetail && item.moduleKey === 'new_order') return false;
          if (!item.permission) return true;
          if (isSuperuser || isSuperUser) return true;
          const perms = Array.isArray(item.permission) ? item.permission : [item.permission];
          return canAny(perms);
        })
        .map((item) => {
          // Pharmacy outlets: rename "New Order" to "Walk-In Sale"
          if (isPharmacy && item.moduleKey === 'new_order') {
            return { ...item, label: 'Walk-In Sale' };
          }
          return item;
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
      {/* Logo / tenant — proportional logo contained in 72px band, or pill fallback */}
      <div className="border-b border-sidebar-border shrink-0 overflow-hidden" style={{ height: '88px' }}>
        {tenant?.logoUrl ? (
          <div className="flex items-center h-full px-3 py-1">
            <img
              src={tenant.logoUrl}
              alt={tenant.name ?? orgSlug}
              className="h-full w-auto max-w-full object-contain"
            />
          </div>
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

      {/* Outlet switcher — visible to admin/manager only */}
      {isHQUser && (
        <div className="pt-3">
          <OutletSwitcher />
        </div>
      )}

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-hide">
        {/* Skeleton while outlet use-case resolves — prevents wrong modules from flashing */}
        {!isResolved && !isSuperUser && (
          <div className="space-y-2 px-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-9 rounded-xl bg-sidebar-foreground/8 animate-pulse" />
            ))}
          </div>
        )}
        {(isResolved || isSuperUser) && visibleGroups.map((group) => (
          <NavGroupSection
            key={group.label}
            group={group}
            orgSlug={orgSlug}
            onClose={onClose}
            initialOpen={isGroupInitiallyOpen(group)}
            lockedFeatures={lockedFeatures}
          />
        ))}

        {/* Platform section — single entry for platform owners; all tabs are inside the page */}
        {isPlatformOwner && (
          <div>
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/25">
              Platform
            </p>
            <div className="space-y-0.5">
              <NavLink item={{ label: 'Platform', icon: Monitor, href: '/platform', moduleKey: 'platform' }} orgSlug={orgSlug} onClose={onClose} />
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
