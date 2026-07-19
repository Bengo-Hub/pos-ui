'use client';

/**
 * usePermissions — single source of truth for permission checks in pos-ui.
 *
 * Permission resolution order:
 *   1. If the session's `permissions[]` (PIN JWT / SSO+pos /auth/me merge / offline-cached
 *      last-known-good) is a NON-EMPTY array → trust it as-is (server-authoritative).
 *   2. Otherwise (empty or absent — includes the pre-first-fetch bootstrap window, and any
 *      moment the session's array is transiently/persistently empty) → derive a default set
 *      from role via the client-side ROLE_PERMISSIONS map. This is intentionally permissive:
 *      it trades "an admin revoking a role down to a genuinely empty grant set won't be
 *      reflected until the session re-authenticates" for "a role/staff member never gets
 *      locked out of every action by a transient empty-array edge case" — the latter is a
 *      P0 outage (2026-07-19: waiters locked out of Tables/order-taking fleet-wide after a
 *      stricter empty-is-authoritative rule shipped for ~20 min), the former is a support ticket.
 *   3. superuser / admin / platform-owner roles always pass every check.
 *
 * Usage:
 *   const { can, canAny, canAll } = usePermissions();
 *   if (can('pos.orders.add')) { ... }
 *   if (canAny(['pos.orders.manage', 'pos.orders.delete'])) { ... }
 *
 * For gating a whole UI element (button, table-row action, nav item), prefer the <Can> component
 * (@/components/auth/can) over inline `{can(...) && <Button/>}` — it's the same resolver, just a
 * single reusable place so "hide this action" is a configuration/permission-matrix change, not a
 * new code site.
 */

import { useMemo } from 'react';
import { useAuthStore } from '@/store/auth';
import { P, ROLE_PERMISSIONS, type Permission } from '@/lib/rbac/permissions';

// Standard superuser roles as seeded by auth-api. 'admin' is the tenant-level superuser;
// 'superuser' is the platform-level superuser. Avoid checking for pos_admin/super_admin
// — those are not seeded in auth-api and cause role check discrepancies.
const SUPERUSER_ROLES = ['superuser', 'admin'];

export function usePermissions() {
  const user = useAuthStore((s) => s.user);

  const effectivePermissions = useMemo<Set<string>>(() => {
    if (!user) return new Set();

    const roles = user.roles ?? [];

    // Superuser / admin / platform owner → full access. The isSuperUser/isPlatformOwner
    // booleans (set directly from auth-service's /me response) are checked FIRST because
    // they're the authoritative signal — unlike the roles-array string match below, they
    // don't depend on exact casing or on this tenant having actually assigned the caller a
    // 'superuser'/'admin' role. A platform owner drilling into a tenant they don't operate
    // (no local RBAC assignment) still carries isPlatformOwner=true from auth-service, but
    // their merged `roles` array can end up without a role that matches SUPERUSER_ROLES —
    // exactly the gap that let a platform superuser's "Edit Line Prices" silently vanish
    // (canEditLines = can(P.ORDERS_MANAGE)) while the header badge, which reads roles[0]
    // directly, still showed "SUPERUSER". Role-array match is also case-insensitive now —
    // auth-service role casing isn't guaranteed lowercase.
    if (
      user.isSuperUser === true ||
      user.isPlatformOwner === true ||
      roles.some((r) => SUPERUSER_ROLES.includes(String(r).toLowerCase()))
    ) {
      return new Set(['*']);
    }

    // REVERTED 2026-07-19: treating an empty array as authoritative caused a P0 outage —
    // waiters (a plain, unmodified role) were locked out of Tables/order-taking entirely.
    // user.permissions can legitimately be a transient empty array for an active session
    // (a fetch race on load/hydrate, not just "never fetched"), so distinguishing "received
    // empty" from "never received" by array-ness alone was unsafe. Back to the original,
    // proven-safe rule: only a NON-empty server array is trusted as-is; empty/absent falls
    // back to the client role map. This reintroduces the original propagation-lag issue
    // (an admin revoking every permission of a role down to a genuinely empty set won't be
    // reflected until the role has at least one grant, or the session re-logs in) — accept
    // that trade-off over an outage; revisit with a server-side "force re-auth" signal
    // instead of changing this fallback's semantics again.
    const serverPerms = (user as any).permissions as string[] | undefined;
    if (serverPerms && serverPerms.length > 0) {
      return new Set(serverPerms);
    }

    // Fall back to client-side role→permission map.
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
    canViewKDS:       canAny([P.KDS_VIEW, P.KDS_CHANGE, P.KDS_MANAGE]),
    canManageDevices: can(P.DEVICES_MANAGE),
  };
}

// Re-export P for convenient import from one place
export { P } from '@/lib/rbac/permissions';
export type { Permission } from '@/lib/rbac/permissions';
