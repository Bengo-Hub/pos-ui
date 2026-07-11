'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { resolveRouteAccess } from '@/lib/pos/route-permissions';
import { PermissionDeniedPage } from './permission-denied';

/**
 * RouteGuard is the app-wide safety net that makes EVERY page permission-covered, including
 * direct-URL navigation. It resolves the current route's required permission from the shared
 * route table (nav-config + explicit extras) and renders PermissionDenied when the signed-in
 * user holds none of them.
 *
 * Design notes:
 *  - Fail-open: routes with no classification render normally (so new pages never silently 404).
 *  - Module gating stays with the page-level <PageGuard>/<ModuleGate> + sidebar; this guard is
 *    purely the permission layer so it can't wrongly claim a module is "unavailable".
 *  - Only runs once the session is authenticated — before that AuthProvider owns the redirect,
 *    and gating early would flash PermissionDenied while permissions are still loading.
 *  - Superusers / platform owners bypass (usePermissions treats them as holding '*').
 */
export function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const status = useAuthStore((s) => s.status);
  const { canAny, isSuperuser } = usePermissions();

  // Don't gate until the session is established — avoids a flash of "Permission Required"
  // during bootstrap, and lets AuthProvider handle the unauthenticated redirect.
  if (status !== 'authenticated' || isSuperuser) {
    return <>{children}</>;
  }

  const access = resolveRouteAccess(pathname);
  if (access?.permission && access.permission.length > 0 && !canAny(access.permission)) {
    return <PermissionDeniedPage />;
  }

  return <>{children}</>;
}
