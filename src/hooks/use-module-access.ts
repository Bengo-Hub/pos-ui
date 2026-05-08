'use client';

/**
 * Centralized module access hook for BengoBox POS.
 * Single source of truth for outlet use-case and module-based authorization.
 *
 * Use case is per-outlet (not per-tenant). The default comes from the tenant
 * but each outlet can override it.
 *
 * Use cases: hospitality, retail, services, quick_service, pharmacy
 *
 * Usage:
 *   const { isHospitality, hasModule } = useModuleAccess();
 *   if (hasModule('kds')) { ... }
 */

import { useAuthStore } from '@/store/auth';

// ─── Module keys ────────────────────────────────────────────────────────────
export type ModuleKey =
  | 'dashboard'
  | 'orders'
  | 'new_order'
  | 'tables'
  | 'kds'
  | 'appointments'
  | 'cash_drawer'
  | 'settings'
  | 'platform'
  | 'hotel'
  | 'shifts'
  | 'reports';

// ─── Use-case types ─────────────────────────────────────────────────────────
export type UseCaseType =
  | 'hospitality'
  | 'retail'
  | 'services'
  | 'quick_service'
  | 'pharmacy';

// ─── Per use-case module configs ────────────────────────────────────────────
const COMMON_MODULES: ModuleKey[] = [
  'dashboard',
  'orders',
  'new_order',
  'cash_drawer',
  'settings',
  'platform',
];

const USE_CASE_MODULES: Record<UseCaseType, ModuleKey[]> = {
  hospitality: [...COMMON_MODULES, 'tables', 'kds', 'appointments', 'hotel', 'shifts', 'reports'],
  retail: [...COMMON_MODULES, 'shifts', 'reports'],
  services: [...COMMON_MODULES, 'appointments', 'shifts', 'reports'],
  quick_service: [...COMMON_MODULES, 'kds', 'shifts', 'reports'],
  pharmacy: [...COMMON_MODULES, 'shifts', 'reports'],
};

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useModuleAccess() {
  const user = useAuthStore((s) => s.user);

  // Use case resolution: outlet-level override > tenant-level default > hospitality fallback
  const rawUseCase =
    (user as any)?.outlet_use_case ??
    (user as any)?.outletUseCase ??
    (user as any)?.tenant_use_case ??
    (user as any)?.tenantUseCase ??
    'hospitality';

  const useCase: UseCaseType = (
    Object.keys(USE_CASE_MODULES).includes(rawUseCase)
      ? rawUseCase
      : 'hospitality'
  ) as UseCaseType;

  const isSuperUser =
    user?.isSuperUser === true ||
    user?.isPlatformOwner === true ||
    (user?.roles ?? []).includes('superuser') ||
    (user?.roles ?? []).includes('super_admin');

  // Use-case convenience flags
  const isHospitality = useCase === 'hospitality';
  const isRetail = useCase === 'retail';
  const isServices = useCase === 'services';
  const isQuickService = useCase === 'quick_service';
  const isPharmacy = useCase === 'pharmacy';

  // Enabled modules for the current use case
  const enabledModules = USE_CASE_MODULES[useCase];

  /**
   * Check if a module is enabled for the current outlet use-case.
   * Superusers always have access.
   */
  function hasModule(moduleKey: string): boolean {
    if (isSuperUser) return true;
    return enabledModules.includes(moduleKey as ModuleKey);
  }

  return {
    // Core
    useCase,
    isSuperUser,
    enabledModules,

    // Use-case flags
    isHospitality,
    isRetail,
    isServices,
    isQuickService,
    isPharmacy,

    // Module check
    hasModule,

    // Convenience flags for common sidebar checks
    showTables: hasModule('tables'),
    showKDS: hasModule('kds'),
    showAppointments: hasModule('appointments'),
  };
}
