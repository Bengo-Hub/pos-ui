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
import { normalizeUseCase } from '@/lib/use-case-config';
import { CORE_MODULE_KEYS } from '@/lib/pos/nav-config';

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
  | 'inventory'
  | 'returns'
  | 'clients'
  | 'staff_schedule'
  | 'resources'
  | 'queue'
  | 'repairs'
  | 'reservations'
  | 'packages'
  | 'accounting'
  | 'crm';

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
  'inventory',
  // Cross-service link groups (Accounting→treasury-ui, CRM→marketflow-ui) — available to every
  // use case but gated by a manager permission on each item; the target service enforces its own RBAC.
  'accounting',
  'crm',
];

const USE_CASE_MODULES: Record<UseCaseType, ModuleKey[]> = {
  // Hospitality (hotel/restaurant/bar/cafe) does NOT include loyalty or commissions — those are
  // retail/services concepts. Bills are settled per table/room, not via customer loyalty balances
  // or per-staff sales commissions. (Removed per QA: no need for Loyalty/Commissions here.)
  hospitality:   [...COMMON_MODULES, 'bar', 'tables', 'reservations', 'kds', 'appointments', 'packages', 'hotel', 'shifts', 'reports', 'online_orders'],
  retail:        [...COMMON_MODULES, 'retail', 'shifts', 'reports', 'layaway', 'loyalty', 'commissions', 'online_orders', 'purchase_orders', 'returns', 'clients', 'repairs'],
  services:      [...COMMON_MODULES, 'appointments', 'packages', 'shifts', 'reports', 'loyalty', 'commissions', 'clients', 'staff_schedule', 'resources', 'queue', 'repairs'],
  quick_service: [...COMMON_MODULES, 'kds', 'shifts', 'reports', 'online_orders'],
  pharmacy:      [...COMMON_MODULES, 'shifts', 'reports', 'pharmacy', 'patients', 'drug_inventory'],
};

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useModuleAccess() {
  const user = useAuthStore((s) => s.user);
  // Read use_case from the persisted outlet (set by service-level outlet selector).
  // Falls back to JWT claims for backward compat. null means not yet resolved.
  const outlet = useAuthStore((s) => s.outlet);
  // Auth/hydration signals used to tell "still loading" apart from "genuinely no outlet".
  const authStatus  = useAuthStore((s) => s.status);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
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

  // Normalize raw outlet use_case (which may be an alias like "hotel", "bar", "cafe", "restaurant",
  // "salon", "spa", "clinic") onto one of the five canonical profiles. Without this, an outlet whose
  // use_case is e.g. "hotel" matched no USE_CASE_MODULES key → useCase=null → the ENTIRE sidebar was
  // hidden for non-superusers. normalizeUseCase guarantees a valid profile for any non-null use_case.
  const useCase: UseCaseType | null = rawUseCase ? (normalizeUseCase(rawUseCase) as UseCaseType) : null;

  const isSuperUser =
    user?.isSuperUser === true ||
    user?.isPlatformOwner === true ||
    (user?.roles ?? []).includes('superuser') ||
    (user?.roles ?? []).includes('super_admin');

  // Outlet-level backend module toggles (staleTime 5min — won't re-fetch on every render)
  const { data: posSettings, isLoading: posSettingsLoading } = usePOSSettings();

  // ── Resolution state (used by gates to avoid flashing "Module Not Available") ──
  // Three distinct situations when there is no concrete use_case yet:
  //   (a) RESOLVED   → useCase != null → module lists apply (handled above).
  //   (b) RESOLVING  → still hydrating/loading (persist not rehydrated, auth still
  //       loading/syncing, or the outlet/posSettings query in flight) → show a loader.
  //   (c) NEEDS OUTLET → authenticated + settled, but genuinely no outlet selected →
  //       prompt to pick an outlet (NOT "Module Not Available").
  // Superusers skip this — they always have access regardless of outlet context.
  const isResolving =
    !isSuperUser &&
    rawUseCase === null &&
    (!hasHydrated || authStatus === 'loading' || authStatus === 'syncing' || posSettingsLoading);

  const needsOutlet =
    !isSuperUser &&
    rawUseCase === null &&
    hasHydrated &&
    authStatus === 'authenticated' &&
    !posSettingsLoading;

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
    // Platform owners / superusers are EXEMPT from a tenant's hide settings — they must always be
    // able to see every module a tenant hid (support, oversight, config on the tenant's behalf).
    // Checked before the tenant hide gate below.
    if (isSuperUser) return true;
    // Tenant admin turned this whole module off (declutter to only the screens they use). Scoped to
    // THIS tenant's non-superuser users only (never other tenants, never system-wide) — except CORE
    // modules (e.g. settings), which can never be hidden or you'd lock yourself out.
    if (posSettings?.disabled_modules?.includes(moduleKey) && !CORE_MODULE_KEYS.has(moduleKey)) return false;
    if (!useCase) return false; // not yet resolved — hide everything
    if (!enabledModules.includes(moduleKey as ModuleKey)) return false;
    // Overlay backend toggle flags from outlet settings.
    // NOTE: 'shifts' is intentionally NOT gated by shift_reports_enabled.
    // shift_reports_enabled controls manager-level shift *reporting* features (reports tab),
    // NOT the staff shift open/close page which every role (waiter, cashier, kitchen) must access.
    if (posSettings) {
      if (moduleKey === 'hotel'        && !posSettings.hotel_module_enabled)   return false;
      if (moduleKey === 'layaway'      && !posSettings.layaway_enabled)         return false;
      if (moduleKey === 'kds'          && !posSettings.enable_kds)              return false;
      if (moduleKey === 'bar'          && !posSettings.enable_kds)              return false; // bar shares KDS toggle
      if (moduleKey === 'appointments' && !posSettings.enable_appointments)     return false;
    }
    return true;
  }

  return {
    // Core
    useCase,
    isResolved,
    isResolving,
    needsOutlet,
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

    // Outlet-level sidebar visibility overrides (declutter to only the screens they use).
    disabledModules: new Set(posSettings?.disabled_modules ?? []),
    hiddenItems: new Set(posSettings?.hidden_items ?? []),

    // Convenience flags for common sidebar checks
    showTables: hasModule('tables'),
    showKDS: hasModule('kds'),
    showAppointments: hasModule('appointments'),
  };
}
