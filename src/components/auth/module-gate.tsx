'use client';

/**
 * ModuleGate: Conditionally render children based on module access.
 * Analogous to AuthorizationGate but for outlet use-case module authorization.
 *
 * Usage:
 *   <ModuleGate moduleKey="kds">
 *     <KDSBoard />
 *   </ModuleGate>
 */

import { useModuleAccess } from '@/hooks/use-module-access';
import type { ReactNode } from 'react';

interface ModuleGateProps {
  /** Module key — hidden if module is not enabled for the current use case */
  moduleKey: string;
  /** Content to show when access is granted */
  children: ReactNode;
  /** Content to show when access is denied (default: nothing) */
  fallback?: ReactNode;
}

export function ModuleGate({
  moduleKey,
  children,
  fallback = null,
}: ModuleGateProps) {
  const { hasModule } = useModuleAccess();

  if (!hasModule(moduleKey)) return <>{fallback}</>;

  return <>{children}</>;
}
