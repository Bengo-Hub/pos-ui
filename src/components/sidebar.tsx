'use client';

import { cn } from '@/lib/utils';
import {
  BarChart3,
  BedDouble,
  Calendar,
  ChefHat,
  ClipboardList,
  Clock,
  Cpu,
  Grid3x3,
  Key,
  LayoutDashboard,
  LogOut,
  Monitor,
  Plus,
  Settings,
  Utensils,
  Wallet,
  Wine,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { useAuthStore } from '@/store/auth';
import { useModuleAccess } from '@/hooks/use-module-access';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';
import type { Permission } from '@/lib/rbac/permissions';

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
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// ── Nav item component ────────────────────────────────────────────────────────

function NavLink({ item, orgSlug, onClose }: { item: NavItem; orgSlug: string; onClose?: () => void }) {
  const pathname = usePathname();
  const href = `/${orgSlug}${item.href}`;
  const active =
    item.href === '/dashboard'
      ? pathname === href
      : pathname.startsWith(href);
  const Icon = item.icon;

  return (
    <Link
      href={href}
      onClick={onClose}
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm',
        active
          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 font-semibold'
          : 'text-white/55 hover:text-white hover:bg-white/8 font-medium'
      )}
    >
      <Icon className={cn('h-4.5 w-4.5 shrink-0 transition-transform duration-200', !active && 'group-hover:scale-110')} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

// ── Sidebar content ───────────────────────────────────────────────────────────

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const { tenant } = useTenantBranding();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const { hasModule, isSuperUser } = useModuleAccess();

  const { canAny, isSuperuser } = usePermissions();
  const isPlatformOwner = isSuperuser || isSuperUser || orgSlug === 'codevertex';

  // ── Define all groups ──────────────────────────────────────────────────────

  const navGroups: NavGroup[] = [
    {
      label: 'Operations',
      items: [
        {
          label: 'Dashboard',
          icon: LayoutDashboard,
          href: '/dashboard',
          moduleKey: 'dashboard',
        },
        {
          label: 'New Order',
          icon: Plus,
          href: '/order',
          moduleKey: 'new_order',
          permission: P.ORDERS_ADD,
        },
        {
          label: 'Orders',
          icon: ClipboardList,
          href: '/orders',
          moduleKey: 'orders',
          permission: [P.ORDERS_VIEW, P.ORDERS_VIEW_OWN],
        },
        {
          label: 'Cash Drawer',
          icon: Wallet,
          href: '/drawer',
          moduleKey: 'cash_drawer',
          permission: [P.DRAWERS_ADD, P.DRAWERS_MANAGE, P.DRAWERS_VIEW_OWN],
        },
        {
          label: 'Shifts',
          icon: Clock,
          href: '/shifts',
          moduleKey: 'shifts',
          permission: [P.SESSIONS_ADD, P.SESSIONS_VIEW, P.SESSIONS_VIEW_OWN],
        },
      ],
    },
    {
      label: 'Floor & Service',
      items: [
        {
          label: 'Tables',
          icon: Grid3x3,
          href: '/tables',
          moduleKey: 'tables',
          permission: [P.TABLES_VIEW, P.TABLES_MANAGE],
        },
        {
          label: 'Appointments',
          icon: Calendar,
          href: '/appointments',
          moduleKey: 'appointments',
          permission: [P.ORDERS_VIEW, P.HOTEL_VIEW],
        },
      ],
    },
    {
      label: 'Kitchen & Bar',
      items: [
        {
          label: 'KDS',
          icon: ChefHat,
          href: '/kds',
          moduleKey: 'kds',
          permission: [P.ORDERS_VIEW, P.ORDERS_MANAGE],
        },
        {
          label: 'Bar Display',
          icon: Wine,
          href: '/bar',
          moduleKey: 'kds',
          permission: [P.ORDERS_VIEW, P.ORDERS_MANAGE],
        },
        {
          label: 'Menu',
          icon: Utensils,
          href: '/order',
          moduleKey: 'new_order',
          permission: P.CATALOG_VIEW,
        },
      ],
    },
    {
      label: 'Hotel',
      items: [
        {
          label: 'Rooms',
          icon: BedDouble,
          href: '/hotel/rooms',
          moduleKey: 'hotel',
          permission: [P.HOTEL_VIEW, P.HOTEL_MANAGE],
        },
        {
          label: 'Facilities',
          icon: Cpu,
          href: '/hotel/facilities',
          moduleKey: 'hotel',
          permission: [P.HOTEL_VIEW, P.HOTEL_MANAGE],
        },
      ],
    },
    {
      label: 'Management',
      items: [
        {
          label: 'Reports',
          icon: BarChart3,
          href: '/reports',
          moduleKey: 'reports',
          permission: [P.REPORTS_VIEW, P.REPORTS_MANAGE],
        },
        {
          label: 'Settings',
          icon: Settings,
          href: '/settings',
          moduleKey: 'settings',
          permission: [P.CONFIG_VIEW, P.CONFIG_CHANGE, P.CONFIG_MANAGE],
        },
      ],
    },
  ];

  // ── Filter groups by module + permission ──────────────────────────────────

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

  // ── Resolve current user display name ──────────────────────────────────────

  const displayName = user?.fullName || tenant?.name || orgSlug;
  const displayInitial = displayName?.[0]?.toUpperCase() ?? '?';
  const primaryRole = (user?.roles ?? [])[0];
  const roleLabel =
    primaryRole === 'admin' || primaryRole === 'pos_admin' ? 'Admin'
    : primaryRole === 'manager' || primaryRole === 'store_manager' ? 'Manager'
    : primaryRole
      ? primaryRole.charAt(0).toUpperCase() + primaryRole.slice(1)
      : 'Staff';

  // ── Sidebar content ────────────────────────────────────────────────────────

  const content = (
    <div className="flex flex-col h-full bg-brand-dark border-r border-white/8">
      {/* Logo / tenant */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/8">
        {tenant?.logoUrl ? (
          <img src={tenant.logoUrl} alt={tenant.name ?? orgSlug} className="h-9 w-auto object-contain" />
        ) : (
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
            <span className="text-sm font-bold text-primary-foreground">
              {(tenant?.orgName ?? orgSlug).slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{tenant?.orgName ?? orgSlug}</p>
          <p className="text-[10px] text-white/35 mt-0.5">POS Terminal</p>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-hide">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href + item.label} item={item} orgSlug={orgSlug} onClose={onClose} />
              ))}
            </div>
          </div>
        ))}

        {/* Platform section */}
        {isPlatformOwner && (
          <div>
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">
              Platform
            </p>
            <div className="space-y-0.5">
              <NavLink
                item={{ label: 'Devices', icon: Monitor, href: '/platform', moduleKey: 'platform' }}
                orgSlug={orgSlug}
                onClose={onClose}
              />
              <NavLink
                item={{ label: 'Licenses', icon: Key, href: '/platform?tab=licenses', moduleKey: 'platform' }}
                orgSlug={orgSlug}
                onClose={onClose}
              />
            </div>
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-white/8">
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/5">
          <div className="h-8 w-8 rounded-lg bg-primary/25 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">{displayInitial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{displayName}</p>
            <p className="text-[10px] text-white/40 mt-0.5">{roleLabel}</p>
          </div>
          <button
            onClick={() => logout()}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-white/35 hover:text-rose-400 hover:bg-white/8 transition-colors"
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
        <div className="flex h-14 items-center justify-between border-b border-white/8 px-4 lg:hidden bg-brand-dark">
          <span className="text-sm font-semibold text-white">Menu</span>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
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
