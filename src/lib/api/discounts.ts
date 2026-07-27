import { apiClient } from '@/lib/api/client';

/**
 * Discounts — pos-api's Promotion + PromotionRule are the platform's discount SOURCE OF
 * TRUTH. This module talks to the tenant-facing /pos/promotions endpoints; other services
 * integrate with the same data via pos-api's /s2s/{tenant}/discounts endpoints, so a
 * discount defined anywhere applies identically everywhere. Happy hours are the SAME rows
 * (promo_kind='happy_hour') — there is no separate happy-hour model.
 */

export type DiscountKind = 'code' | 'auto' | 'happy_hour';

export type MealPeriod = 'breakfast' | 'am_break' | 'lunch' | 'pm_break' | 'dinner';

/** The discount rule attached to a promotion — scope (which items) + mechanism (how much off). */
export interface PromotionRule {
  id: string;
  promotion_id: string;
  scope_type: 'all' | 'category' | 'item';
  /** Item SKUs (scope_type='item') or category names (scope_type='category'). For BOGO
   *  this is the "buy" scope (what must be purchased to trigger the deal). */
  scope_ids?: string[];
  discount_type: 'percentage' | 'fixed_amount' | 'fixed_price' | 'bogo';
  discount_value: number;
  // BOGO ("buy X get Y [at N% off]") — only meaningful when discount_type === 'bogo'.
  buy_quantity: number;
  get_quantity: number;
  get_discount_percent: number;
  /** BOGO cross-item pairing: SKUs eligible for the free/discounted "get" unit when they are a
   *  DIFFERENT item from scope_ids — e.g. scope_ids=Large pizzas, get_scope_ids=Small pizzas
   *  ("buy one large, get one small free"). Empty/absent = same-SKU BOGO (the free unit is
   *  another unit of the same item already bought). */
  get_scope_ids?: string[];
  /** BOGO CORRESPONDING cross-item pairing: each "buy" SKU → its one specific free "get" SKU
   *  (e.g. "PIZ003" Margherita-Large → "PIZ001" Margherita-Small — "buy a Large, get the matching
   *  Small free"). When set, scope_ids = the keys and get_scope_ids = the values; the terminal
   *  auto-adds the mapped item and the evaluator frees exactly it (not the cheapest get item). */
  get_pair_map?: Record<string, string>;
  max_discount?: number | null;
  meal_period?: MealPeriod | null;
}

/**
 * Storefront marketing banner config — lives inside Promotion.metadata["banner"] (no
 * dedicated schema column). Flags a promotion to also surface as a banner on the
 * customer-facing ordering storefront (a separate app); ordering-backend reads active
 * flagged promotions via pos-api's GET /s2s/{tenant}/discounts/banners.
 */
export interface DiscountBannerConfig {
  show_on_storefront: boolean;
  banner_title?: string;
  banner_subtitle?: string;
  banner_image_url?: string;
  cta_label?: string;
  cta_link?: string;
  banner_color?: string;
  text_color?: string;
  /** Empty/absent = show for every outlet use_case. */
  use_cases?: string[];
}

export interface Discount {
  id: string;
  name: string;
  description?: string;
  promo_code?: string | null;
  promo_kind: DiscountKind | string;
  outlet_id?: string | null;
  days_of_week?: number[];
  window_start?: string;
  window_end?: string;
  start_at?: string | null;
  end_at?: string | null;
  auto_apply: boolean;
  status: string;
  rule?: PromotionRule | null;
  /** Freeform JSON blob; `banner` is the only key this app currently reads/writes. */
  metadata?: { banner?: DiscountBannerConfig; [key: string]: unknown } | null;
}

/**
 * Create/update payload — one shape shared with the backend's createPromoInput, covering
 * EVERY rule capability (BOGO/pair-map/meal-period included) so the shared form can edit
 * any existing row losslessly. Formerly the BOGO fields lived only on HappyHourInput.
 */
export interface DiscountInput {
  name: string;
  promo_kind: DiscountKind;
  promo_code?: string;
  outlet_id?: string;
  days_of_week?: number[];
  window_start?: string;
  window_end?: string;
  start_at?: string | null;
  end_at?: string | null;
  auto_apply: boolean;
  scope_type?: 'all' | 'category' | 'item';
  /** Item SKUs (scope_type='item') or category names (scope_type='category'); BOGO "buy" scope. */
  scope_ids?: string[];
  discount_type?: 'percentage' | 'fixed_amount' | 'fixed_price' | 'bogo';
  discount_value: number;
  buy_quantity?: number;
  get_quantity?: number;
  get_discount_percent?: number;
  /** BOGO cross-item "get" scope — see PromotionRule.get_scope_ids. */
  get_scope_ids?: string[];
  /** BOGO corresponding pairing — see PromotionRule.get_pair_map. When set, scope_ids /
   *  get_scope_ids are derived server-side from its keys/values. */
  get_pair_map?: Record<string, string>;
  max_discount?: number;
  meal_period?: MealPeriod | '';
  /** Optional storefront banner config — merged read/merge/write into metadata["banner"]
   *  server-side; other metadata keys already stored on the promotion are preserved. */
  banner?: DiscountBannerConfig;
}

export interface DiscountListResponse {
  data: Discount[];
  meta?: { total?: number };
  total?: number;
}

export interface DiscountListOpts {
  /** Server-side name search (promotion.NameContainsFold). */
  q?: string;
  page?: number;
  limit?: number;
}

export const discountsApi = {
  /** status: 'active' | 'inactive' | 'all' (default) — 'all' lists every status for management. */
  list: (tenantSlug: string, status: string = 'all', opts: DiscountListOpts = {}) => {
    const params = new URLSearchParams({ status });
    params.set('limit', String(opts.limit ?? 100));
    if (opts.page && opts.page > 1) params.set('page', String(opts.page));
    if (opts.q?.trim()) params.set('q', opts.q.trim());
    return apiClient.get<DiscountListResponse>(
      `/api/v1/${tenantSlug}/pos/promotions?${params.toString()}`,
    );
  },

  /** Currently-in-window auto-apply (happy-hour kind) promotions — the terminal's poll. */
  listActive: (tenantSlug: string) =>
    apiClient
      .get<Discount[]>(`/api/v1/${tenantSlug}/pos/promotions/happy-hour/active`)
      .then((r) => r ?? []),

  get: (tenantSlug: string, id: string) =>
    apiClient.get<Discount>(`/api/v1/${tenantSlug}/pos/promotions/${id}`),

  create: (tenantSlug: string, body: DiscountInput) =>
    apiClient.post<Discount>(`/api/v1/${tenantSlug}/pos/promotions`, body),

  update: (tenantSlug: string, id: string, body: DiscountInput) =>
    apiClient.patch<Discount>(`/api/v1/${tenantSlug}/pos/promotions/${id}`, body),

  /** Soft-delete — the backend flips status to inactive (past sales keep their audit link). */
  remove: (tenantSlug: string, id: string) =>
    apiClient.delete(`/api/v1/${tenantSlug}/pos/promotions/${id}`),

  /** Validate a promo code against an amount (same evaluation the terminal uses). */
  apply: (tenantSlug: string, promoCode: string, amount: number) =>
    apiClient.post<{ valid: boolean; reason?: string; discountAmount?: string }>(
      `/api/v1/${tenantSlug}/pos/promotions/apply`,
      { promoCode, amount },
    ),
};
