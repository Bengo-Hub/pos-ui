/**
 * Single source of truth for subscription FEATURE gating on the POS UI.
 *
 * Every feature code here is a *real* code seeded by subscription-service
 * (cmd/seed/plans_bundles.go, plans_pos.go, feature_catalog.go). The sidebar, page
 * tabs, and buttons gate against these codes via `useSubscription().hasFeature(code)`.
 *
 * Why a catalog instead of hardcoded "Pro"/"Growth" labels on each nav item:
 *  - It prevents drift. Before this catalog the sidebar gated on codes that did not
 *    exist in any plan (e.g. `loyalty` vs the seeded `loyalty_program`, `online_orders`
 *    vs `online_ordering`), which permanently locked features the tenant had paid for.
 *  - The lock badge ("Growth"/"Professional") is derived from the lowest tier that
 *    actually includes the feature, so a Complete Starter tenant sees the *correct*
 *    upgrade target.
 *
 * Gating rule (see sidebar / FeatureGate): a feature is LOCKED only when its code is
 * present in this catalog AND `hasFeature(code)` is false. A `subFeature` that is NOT in
 * this catalog is treated as un-gated (fail-open / visible) — so a typo can never silently
 * hide a real capability, and an item gains gating automatically once its code is seeded.
 */

/** Tier label shown on the lock badge — the lowest plan tier that grants the feature. */
export type RequiredPlanLabel = 'Starter' | 'Growth' | 'Professional';

export interface FeatureCatalogEntry {
  /** Human-readable feature name (for modals / tooltips). */
  label: string;
  /** Lowest tier that includes the feature → drives the lock-badge text. */
  requiredPlanLabel: RequiredPlanLabel;
}

export const FEATURE_CATALOG: Record<string, FeatureCatalogEntry> = {
  // ── Included from the lowest tier (Complete Starter / POS Device-1) ──
  // These are effectively never locked for a paying tenant; listed so gating is explicit.
  pos_terminal:      { label: 'POS Terminal',       requiredPlanLabel: 'Starter' },
  order_management:  { label: 'Order Management',   requiredPlanLabel: 'Starter' },
  receipt_printing:  { label: 'Receipt Printing',   requiredPlanLabel: 'Starter' },
  daily_reports:     { label: 'Daily Reports',      requiredPlanLabel: 'Starter' },
  shift_reports:     { label: 'Shift Reports',      requiredPlanLabel: 'Starter' },
  table_management:  { label: 'Table Management',   requiredPlanLabel: 'Starter' },
  kds:               { label: 'Kitchen Display',    requiredPlanLabel: 'Starter' },
  offline_sync:      { label: 'Offline Sync',       requiredPlanLabel: 'Starter' },
  mpesa_pos:         { label: 'M-Pesa POS',         requiredPlanLabel: 'Starter' },
  loyalty_program:   { label: 'Loyalty Program',    requiredPlanLabel: 'Starter' },
  online_ordering:   { label: 'Online Ordering',    requiredPlanLabel: 'Starter' },

  // ── Unlocked at Growth (Complete Growth / POS Device-5) ──
  multi_cashier:     { label: 'Multi-Cashier',      requiredPlanLabel: 'Growth' },
  multi_outlet:      { label: 'Multi-Outlet',       requiredPlanLabel: 'Growth' },
  advanced_analytics:{ label: 'Advanced Analytics', requiredPlanLabel: 'Growth' },

  // ── Unlocked at Professional (Complete Professional / POS Device-10) ──
  hotel_module:      { label: 'Hotel Management',   requiredPlanLabel: 'Professional' },
  conference_events: { label: 'Conference & Events',requiredPlanLabel: 'Professional' },
  happy_hour:        { label: 'Happy Hour',         requiredPlanLabel: 'Professional' },
};

/** True when the code is a recognised, gateable subscription feature. */
export function isKnownFeature(code: string | undefined): code is string {
  return !!code && code in FEATURE_CATALOG;
}

/** Lock-badge label for a feature code (lowest tier that grants it), or undefined if unknown. */
export function requiredPlanLabel(code: string | undefined): RequiredPlanLabel | undefined {
  return code ? FEATURE_CATALOG[code]?.requiredPlanLabel : undefined;
}

/** Human-readable feature name, falling back to the raw code. */
export function featureLabel(code: string | undefined): string {
  if (!code) return '';
  return FEATURE_CATALOG[code]?.label ?? code;
}
