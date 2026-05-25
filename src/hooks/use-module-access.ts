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
import { useOutletFilterStore } from '@/store/outlet-filter';
import { usePOSSettings } from './usePOSSettings';

// ─── Module keys ────────────────────────────────────────────────────────────
export type ModuleKey =
  | 'dashboard'
  | 'orders'
  | 'new_order'
  | 'tables'
  | 'kds'
  | 'bar'
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
  | 'retail'
  | 'pharmacy'
  | 'patients'
  | 'drug_inventory'
  | 'purchase_orders'
  | 'returns'
  | 'clients'
  | 'staff_schedule'
  | 'resources'
  | 'queue';

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
  hospitality:   [...COMMON_MODULES, 'bar', 'tables', 'kds', 'appointments', 'hotel', 'shifts', 'reports', 'loyalty', 'commissions', 'online_orders'],
  retail:        [...COMMON_MODULES, 'retail', 'shifts', 'reports', 'layaway', 'loyalty', 'commissions', 'online_orders', 'purchase_orders', 'returns', 'clients'],
  services:      [...COMMON_MODULES, 'appointments', 'shifts', 'reports', 'loyalty', 'commissions', 'clients', 'staff_schedule', 'resources', 'queue'],
  quick_service: [...COMMON_MODULES, 'kds', 'shifts', 'reports', 'online_orders'],
  pharmacy:      [...COMMON_MODULES, 'shifts', 'reports', 'pharmacy', 'patients', 'drug_inventory'],
};

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useModuleAccess() {
  const user = useAuthStore((s) => s.user);
  // Read use_case from the persisted outlet (set by service-level outlet selector).
  // Falls back to JWT claims for backward compat. null means not yet resolved.
  const outlet = useAuthStore((s) => s.outlet);
  // When an HQ admin drills into a specific outlet, that outlet's use_case takes priority.
  const drillOutlet = useOutletFilterStore((s) => s.selectedOutlet);

  // Use case resolution: drill-down outlet > home outlet store > JWT claims > null (unresolved)
  // IMPORTANT: never fall back to a hardcoded use case — that causes wrong modules to appear
  // while the outlet context is still loading (e.g. Kitchen & Bar showing on pharmacy outlets).
  const rawUseCase: string | null =
    drillOutlet?.useCase ??
    outlet?.use_case ??
    (user as any)?.outlet_use_case ??
    (user as any)?.outletUseCase ??
    (user as any)?.tenant_use_case ??
    (user as any)?.tenantUseCase ??
    null;

  // isResolved is false until we have a concrete use case. Sidebar renders a skeleton until true.
  const isResolved = rawUseCase !== null;

  const useCase: UseCaseType | null = (
    rawUseCase && Object.keys(USE_CASE_MODULES).includes(rawUseCase)
      ? rawUseCase as UseCaseType
      : null
  );

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

  // Enabled modules for the current use case (empty until use case resolves)
  const enabledModules: ModuleKey[] = useCase ? USE_CASE_MODULES[useCase] : [];

  /**
   * Check if a module is enabled for the current outlet.
   * Superusers always have access.
   * Regular users must pass both use-case check AND backend toggle (where applicable).
   * Returns false when use case hasn't resolved yet (isResolved=false).
   */
  function hasModule(moduleKey: string): boolean {
    if (isSuperUser) return true;
    if (!useCase) return false; // not yet resolved — hide everything
    if (!enabledModules.includes(moduleKey as ModuleKey)) return false;
    // Overlay backend toggle flags from outlet settings
    if (posSettings) {
      if (moduleKey === 'hotel'        && !posSettings.hotel_module_enabled)   return false;
      if (moduleKey === 'layaway'      && !posSettings.layaway_enabled)         return false;
      if (moduleKey === 'kds'          && !posSettings.enable_kds)              return false;
      if (moduleKey === 'bar'          && !posSettings.enable_kds)              return false; // bar shares KDS toggle
      if (moduleKey === 'appointments' && !posSettings.enable_appointments)     return false;
      if (moduleKey === 'shifts'       && !posSettings.shift_reports_enabled)   return false;
    }
    return true;
  }

  return {
    // Core
    useCase,
    isResolved,
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
