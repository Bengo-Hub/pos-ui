'use client';

import type { ReactNode } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import type { Permission } from '@/lib/rbac/permissions';

/**
 * <Can> — the single, canonical way to gate a visible UI element (button, table-row action icon,
 * card action, inline control) by the logged-in user's permissions. It wraps the SAME resolver
 * every other permission check in the app uses (`usePermissions().can`/`canAny`/`canAll` — the
 * server-authoritative array from pos-api's /auth/me, unioning role grants + additive per-user
 * role assignments), so a tenant admin toggling a box in the permission matrix hides/shows the
 * gated element everywhere it's used — no code change, no new gate to remember to update.
 *
 * Do NOT use the legacy `userHasPermission`/`AuthorizationGate`/`PermissionActionButton` path —
 * it was a second, divergent resolver against a permission vocabulary that never matched the real
 * backend codes and has been removed. `<Can>` is the only supported primitive going forward.
 *
 * Usage:
 *   <Can permission={P.PAYMENTS_ADD}>
 *     <Button onClick={settle}>Settle Bill</Button>
 *   </Can>
 *
 *   <Can any={[P.ORDERS_VIEW, P.ORDERS_MANAGE]} fallback={<ReadOnlyBadge />}>
 *     <EditControls />
 *   </Can>
 *
 * Exactly one of `permission` / `any` / `all` should be provided. Superusers/admins/platform
 * owners always pass (handled by usePermissions itself).
 */
export function Can({
  permission,
  any,
  all,
  fallback = null,
  children,
}: {
  /** A single required permission code. */
  permission?: Permission | string;
  /** Passes if the user holds ANY of these permission codes. */
  any?: (Permission | string)[];
  /** Passes if the user holds ALL of these permission codes. */
  all?: (Permission | string)[];
  /** Rendered instead of children when the check fails (default: nothing). */
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can, canAny, canAll } = usePermissions();

  let allowed = true;
  if (permission !== undefined) allowed = can(permission);
  else if (any !== undefined) allowed = canAny(any);
  else if (all !== undefined) allowed = canAll(all);

  return allowed ? <>{children}</> : <>{fallback}</>;
}

/** Non-JSX helper for the (rarer) case of gating a value or a callback rather than markup. */
export function useCan() {
  return usePermissions();
}
