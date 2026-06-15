'use client';

import type { ReactNode } from 'react';
import { useModuleAccess } from '@/hooks/use-module-access';
import { usePermissions } from '@/hooks/usePermissions';
import type { Permission } from '@/lib/rbac/permissions';
import { ModuleUnavailablePage } from './module-unavailable';
import { PermissionDeniedPage } from './permission-denied';

interface PageGuardProps {
  /** Use-case module key — if the outlet's use case doesn't include it, show ModuleUnavailable. */
  moduleKey: string;
  /**
   * At least one of these permissions must be held to view the page. Omit for module-only pages.
   * Mirror the SAME permission list used on the sidebar nav item so visibility and access agree.
   */
  permission?: Permission | Permission[];
  /** Human label for the permission-denied message (e.g. "Reservations"). */
  label?: string;
  children: ReactNode;
}

/**
 * Single entry point for page-level gating. Order matters and the messages are distinct:
 *   1. Module not in the use case            → "Module Not Available" (use-case message)
 *   2. Module available but role lacks perm   → "Permission Required" (role message)
 * This replaces the old pattern of rendering ModuleUnavailablePage on a permission miss, which
 * wrongly told users a module was disabled when they simply lacked the permission.
 */
export function PageGuard({ moduleKey, permission, label, children }: PageGuardProps) {
  const { hasModule } = useModuleAccess();
  const { canAny, isSuperuser } = usePermissions();

  if (!hasModule(moduleKey)) {
    return <ModuleUnavailablePage moduleKey={moduleKey} />;
  }

  if (permission && !isSuperuser) {
    const perms = Array.isArray(permission) ? permission : [permission];
    if (!canAny(perms)) {
      return <PermissionDeniedPage what={label} />;
    }
  }

  return <>{children}</>;
}
