'use client';

/**
 * Centralized module access hook for BengoBox POS.
 * Two-level gating:
 *   1. Use-case level: does this use case support the module at all?
 *   2. Outlet setting level: is the module toggled on in pos-api outlet settings?
 *
 * Use case is per-outlet (not per-tenant). The default comes from the tenant
 * but each outlet can override it.
 *
 * Use cases: hospitality, retail, services, quick_service, pharmacy
 */

import { useAuthStore } from '@/store/auth';
import { usePOSSettings } from './usePOSSettings';

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
  | 'reports'
  | 'layaway'
  | 'loyalty'
  | 'commissions'
  | 'online_orders'
  | 'retail';

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
  hospitality:   [...COMMON_MODULES, 'tables', 'kds', 'appointments', 'hotel', 'shifts', 'reports', 'loyalty', 'commissions', 'online_orders'],
  retail:        [...COMMON_MODULES, 'retail', 'shifts', 'reports', 'layaway', 'loyalty', 'commissions', 'online_orders'],
  services:      [...COMMON_MODULES, 'appointments', 'shifts', 'reports', 'loyalty', 'commissions'],
  quick_service: [...COMMON_MODULES, 'kds', 'shifts', 'reports', 'online_orders'],
  pharmacy:      [...COMMON_MODULES, 'shifts', 'reports', 'loyalty'],
};

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useModuleAccess() {
  const user = useAuthStore((s) => s.user);
  // Read use_case from the persisted outlet (set by service-level outlet selector).
  // Falls back to JWT claims for backward compat, then defaults to 'hospitality'.
  const outlet = useAuthStore((s) => s.outlet);

  // Use case resolution: outlet store (post-login) > JWT claims > fallback
  const rawUseCase =
    outlet?.use_case ??
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

  // Outlet-level backend module toggles (staleTime 5min — won't re-fetch on every render)
  const { data: posSettings } = usePOSSettings();

  // Use-case convenience flags
  const isHospitality = useCase === 'hospitality';
  const isRetail = useCase === 'retail';
  const isServices = useCase === 'services';
  const isQuickService = useCase === 'quick_service';
  const isPharmacy = useCase === 'pharmacy';

  // Enabled modules for the current use case
  const enabledModules = USE_CASE_MODULES[useCase];

  /**
   * Check if a module is enabled for the current outlet.
   * Superusers always have access.
   * Regular users must pass both use-case check AND backend toggle (where applicable).
   */
  function hasModule(moduleKey: string): boolean {
    if (isSuperUser) return true;
    if (!enabledModules.includes(moduleKey as ModuleKey)) return false;
    // Overlay backend toggle flags from outlet settings
    if (posSettings) {
      if (moduleKey === 'hotel'    && !posSettings.hotel_module_enabled)  return false;
      if (moduleKey === 'layaway'  && !posSettings.layaway_enabled)        return false;
      if (moduleKey === 'kds'      && !posSettings.enable_kds)             return false;
      if (moduleKey === 'appointments' && !posSettings.enable_appointments) return false;
      if (moduleKey === 'shifts'   && !posSettings.shift_reports_enabled)  return false;
    }
    return true;
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
