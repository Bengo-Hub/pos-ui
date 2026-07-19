'use client';

import { useModuleAccess } from '@/hooks/use-module-access';
import { normalizeUseCase } from '@/lib/use-case-config';
import { useSubscription } from '@/hooks/use-subscription';
import { usePermissions } from '@/hooks/usePermissions';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { useOwnScope } from '@/lib/rbac/scope';
import { isPlatformOwner as checkPlatformOwner } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { useAuthStore } from '@/store/auth';
import { ChevronDown, Lock, LogOut, Monitor, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useState } from 'react';
import { buildNavGroups, type NavItem, type NavGroup } from '@/lib/pos/nav-config';
import { P } from '@/lib/rbac/permissions';

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  // collapsed hides the desktop sidebar entirely (the POS terminal defaults to this to give the
  // cart/product grid the full width). Mobile still uses the `open` overlay, unaffected by collapse.
  collapsed?: boolean;
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

  // Subscription-locked items stay navigable — they open the real page, which surfaces its
  // own upgrade blocker. We only add an amber "upgrade" badge as a hint; never a dead-end
  // link to the pricing page (that hid the feature behind an external bounce).
  const lockBadge = locked ? (
    <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-500 border border-amber-500/20 shrink-0">
      <Lock className="h-2.5 w-2.5" />
      {subPlan ?? 'Pro'}
    </span>
  ) : null;

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
      <span className="truncate flex-1">{item.label}</span>
      {!active && lockBadge}
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
            // Badge shows the nav item's hand-typed tier (short, e.g. "Pro"); the shared upgrade
            // dialog (opened on click) names the exact unlocking plan from the remote catalog.
            const planLabel = item.subPlan;
            return (
              <NavLink
                key={item.href + item.label}
                item={item}
                orgSlug={orgSlug}
                onClose={onClose}
                locked={locked}
                subPlan={planLabel}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar({ open = false, onClose, collapsed = false }: SidebarProps) {
  const params = useParams();
  const pathname = usePathname();
  const orgSlug = params?.orgSlug as string;
  const { tenant } = useTenantBranding();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const { hasModule, isSuperUser, isResolved, hiddenItems } = useModuleAccess();
  const { canAny, isSuperuser } = usePermissions();
  const { data: posSettings } = usePOSSettings();
  const { ownOnly: ownScope } = useOwnScope();
  const { hasFeature, isLoading: subLoading, info: subInfo } = useSubscription();
  // Platform-owner-only (device fleet, platform config, licensing). A tenant `admin` is
  // NOT a platform owner — only the is_platform_owner claim, the superuser role, or the
  // codevertex tenant (verified via the server-returned tenant slug, not the URL) qualifies.
  const isPlatformOwner = checkPlatformOwner(user);

  // HQ users (admin/manager/superuser) can switch between outlets; everyone else is locked to their outlet.
  const userRoles = user?.roles ?? [];
  const isHQUser = isPlatformOwner || userRoles.some((r) => ['admin', 'pos_admin', 'manager', 'store_manager', 'superuser', 'super_admin'].includes(r));

  const outlet = useAuthStore((s) => s.outlet);
  // Normalize the raw use_case (which may be "hotel"/"bar"/"cafe"/"restaurant"/"salon"/"spa"…) onto a
  // canonical profile so role/use-case gating is consistent with useModuleAccess and never leaks the
  // wrong menus (e.g. a "hotel" outlet must behave like hospitality, not fall through to retail).
  const outletProfile = normalizeUseCase(outlet?.use_case ?? (user as any)?.outlet_use_case ?? '');
  const isServices = outletProfile === 'services';
  const isPharmacy = outletProfile === 'pharmacy';

  // ── Nav groups ────────────────────────────────────────────────────────────

  const isWaiter = !isHQUser && userRoles.includes('waiter');
  // The hospitality-cashier menu surface is now CONFIGURABLE per outlet (cashier_terminal_surface):
  // 'full_till' (default) shows the POS Terminal + Add Sale + Tables so a hospitality cashier can
  // ring sales AND settle bills; 'bills_only' hides those `cashierHospHidden` items so they work
  // from the Orders/Tables bill list only. Replaces the old hardcoded "hide for hospitality" rule.
  const terminalSurface = posSettings?.cashier_terminal_surface ?? 'full_till';
  const isCashierBillsOnly = !isHQUser && userRoles.includes('cashier') && terminalSurface === 'bills_only';
  // A "super waiter" (waiter/cashier granted pos.orders.view or manage — e.g. via the additive
  // floor_supervisor role) is elevated: they see the bill/sales surfaces that are otherwise hidden
  // from floor staff. Each such item still enforces its own permission below, so nothing leaks.
  const elevatedBills = canAny([P.ORDERS_VIEW, P.ORDERS_MANAGE]);
  // Own-only principals (view_own without full view — cashiers, plain waiters) see the sales menu
  // as "My Sales"/"My POS". Shared useOwnScope keeps this identical to the sales list + Tables +
  // server scoping (and honors the outlet's cashier_sales_visibility policy).
  const ownSalesOnly = ownScope && !isSuperUser && !isPlatformOwner;

  // Single source of truth for the nav — shared with the Modules settings tab so the "hide these
  // screens" toggles always match what renders. Gating (permission/role/profile/subscription/hidden)
  // is applied below.
  const navGroups: NavGroup[] = buildNavGroups(orgSlug);

  // ── Filter by module + permission; subscription features shown but locked ───

  // Collect which subFeature codes are locked (not unlocked by the current plan/tier).
  // Rules:
  //  - Platform owners / superusers bypass all gates (hasFeature already returns true for them).
  //  - Gate only once entitlements have loaded (subInfo resolved & not loading), so nothing is
  //    locked during the initial fetch.
  //  - hasFeature() delegates to the shared tier-aware isFeatureUnlocked: it unlocks a code that is
  //    granted OR at/below the tenant's tier (same family), AND fail-opens any code the remote
  //    feature catalog doesn't define — so a typo/un-seeded feature can never permanently hide a
  //    real capability. This replaced the old local FEATURE_CATALOG whitelist.
  const lockedFeatures = new Set<string>();
  if (!isPlatformOwner && !subLoading && subInfo !== undefined && subInfo !== null) {
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
          // Tenant admin hid this individual item (by href) via Settings → Modules. Platform owners /
          // superusers are EXEMPT (they see everything a tenant hid); the hide is tenant-scoped only.
          if (hiddenItems.has(item.href) && !isSuperUser && !isSuperuser && !isPlatformOwner) return false;
          // Hide items not relevant to this outlet's use case (e.g. retail back-office on hospitality).
          if (item.hideForProfiles?.includes(outletProfile)) return false;
          // Waiter role: normally only Tables + Shifts. A super-waiter (elevated with
          // pos.orders.view/manage) keeps the bill/sales surfaces — each still enforces its own
          // permission below, so this only un-hides what they're actually granted.
          if (isWaiter && !elevatedBills && item.waiterHidden) return false;
          // Hospitality cashier with the 'bills_only' terminal surface: hide the fast terminal /
          // add-sale items (they settle from Tables/Orders). 'full_till' (default) shows them.
          if (isCashierBillsOnly && item.cashierHospHidden) return false;
          // Services outlets sell through the adaptive /order terminal ("New Sale") — they also have
          // Appointments/Queue/Packages, but those surfaces have no checkout, so order entry must stay
          // available (previously hiding new_order/orders left services with no way to take payment).
          // Retail outlets now use the adaptive /order terminal (legacy /retail page retired).
          if (!item.permission) return true;
          if (isSuperuser || isSuperUser) return true;
          const perms = Array.isArray(item.permission) ? item.permission : [item.permission];
          return canAny(perms);
        })
        .map((item) => {
          // Pharmacy outlets: the fast terminal IS the "Walk-In Sale" surface. Rename ONLY the POS
          // Terminal entry — not every new_order item: Add Sale and Credit Sale also use
          // moduleKey 'new_order', so matching on that produced three identical "Walk-In Sale" rows.
          if (isPharmacy && item.href === '/order') {
            return { ...item, label: 'Walk-In Sale' };
          }
          // Services outlets: the terminal is the "New Sale" surface (matches the terminal title).
          if (isServices && item.href === '/order') {
            return { ...item, label: 'New Sale' };
          }
          // Waiters see their own shift page as "My Shifts".
          if (isWaiter && item.href === '/shifts') {
            return { ...item, label: 'My Shifts' };
          }
          // Own-only users (cashiers/waiters): the sales lists are scoped to THEIR sales, so the
          // menu reads "My Sales"/"My POS" instead of "All Sales"/"POS Sales" (QA req 6).
          if (ownSalesOnly && item.href === '/sell/all-sales') {
            return { ...item, label: 'My Sales' };
          }
          if (ownSalesOnly && item.href === '/sell/pos-sales') {
            return { ...item, label: 'My POS' };
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

      {/* Outlet switching lives ONLY in the top-nav header chip (HeaderOutletChip) — the
          sidebar duplicate was removed so there is one switcher, one source of truth. */}

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
              {/* Sync Monitor is a platform diagnostics surface (moved out of tenant Management
                  per the use-case PowerSuite specs); the page itself also guards on platform owner. */}
              <NavLink item={{ label: 'Sync Monitor', icon: RefreshCw, href: '/sync-monitor', moduleKey: 'platform' }} orgSlug={orgSlug} onClose={onClose} />
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
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          // Desktop collapse: drop the sidebar out of the flex row so main content spans full width.
          collapsed && 'lg:hidden'
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
