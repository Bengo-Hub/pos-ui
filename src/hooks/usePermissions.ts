'use client';

/**
 * usePermissions — single source of truth for permission checks in pos-ui.
 *
 * Permission resolution order:
 *   1. If JWT/session carries `permissions[]` → use those directly (server-authoritative)
 *   2. Otherwise, derive from role via ROLE_PERMISSIONS client-side map
 *   3. superuser / admin roles always pass every check
 *
 * Usage:
 *   const { can, canAny, canAll } = usePermissions();
 *   if (can('pos.orders.add')) { ... }
 *   if (canAny(['pos.orders.manage', 'pos.orders.delete'])) { ... }
 */

import { useMemo } from 'react';
import { useAuthStore } from '@/store/auth';
import { P, ROLE_PERMISSIONS, type Permission } from '@/lib/rbac/permissions';

const SUPERUSER_ROLES = ['superuser', 'admin', 'pos_admin', 'super_admin'];

export function usePermissions() {
  const user = useAuthStore((s) => s.user);

  const effectivePermissions = useMemo<Set<string>>(() => {
    if (!user) return new Set();

    const roles = user.roles ?? [];

    // Superuser / admin → full access
    if (roles.some((r) => SUPERUSER_ROLES.includes(r))) {
      return new Set(['*']);
    }

    // Use server-provided permissions if present (PIN JWT or SSO /me)
    const serverPerms = (user as any).permissions as string[] | undefined;
    if (serverPerms && serverPerms.length > 0) {
      return new Set(serverPerms);
    }

    // Fall back to client-side role→permission map
    const derived = new Set<string>();
    for (const role of roles) {
      const rolePerms = ROLE_PERMISSIONS[role] ?? [];
      for (const p of rolePerms) derived.add(p);
    }
    return derived;
  }, [user]);

  const isSuperuser = effectivePermissions.has('*');

  /** Check a single permission */
  function can(permission: Permission | string): boolean {
    if (isSuperuser) return true;
    return effectivePermissions.has(permission);
  }

  /** True if the user has ANY of the given permissions */
  function canAny(permissions: (Permission | string)[]): boolean {
    if (isSuperuser) return true;
    return permissions.some((p) => effectivePermissions.has(p));
  }

  /** True if the user has ALL of the given permissions */
  function canAll(permissions: (Permission | string)[]): boolean {
    if (isSuperuser) return true;
    return permissions.every((p) => effectivePermissions.has(p));
  }

  return {
    can,
    canAny,
    canAll,
    isSuperuser,
    permissions: effectivePermissions,
    // Convenience shortcuts for common checks
    canCreateOrder:   can(P.ORDERS_ADD),
    canViewOrders:    canAny([P.ORDERS_VIEW, P.ORDERS_VIEW_OWN]),
    canManageOrders:  can(P.ORDERS_MANAGE),
    canTakePayment:   can(P.PAYMENTS_ADD),
    canManageDrawer:  can(P.DRAWERS_MANAGE),
    canOpenDrawer:    canAny([P.DRAWERS_ADD, P.DRAWERS_MANAGE]),
    canViewReports:   can(P.REPORTS_VIEW),
    canManageStaff:   can(P.USERS_MANAGE),
    canViewSettings:  can(P.CONFIG_VIEW),
    canChangeSettings:can(P.CONFIG_CHANGE),
    canManageCatalog: canAny([P.CATALOG_MANAGE, P.CATALOG_CHANGE]),
    canManageTables:  canAny([P.TABLES_MANAGE, P.TABLES_CHANGE]),
    canManageHotel:   can(P.HOTEL_MANAGE),
    canViewHotel:     canAny([P.HOTEL_VIEW, P.HOTEL_MANAGE]),
    canViewKDS:       canAny([P.ORDERS_VIEW, P.ORDERS_VIEW_OWN]),
    canManageDevices: can(P.DEVICES_MANAGE),
  };
}

// Re-export P for convenient import from one place
export { P } from '@/lib/rbac/permissions';
export type { Permission } from '@/lib/rbac/permissions';
