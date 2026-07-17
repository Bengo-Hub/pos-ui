import { apiClient } from '@/lib/api/client';
import type { PromotionRule } from '@/lib/api/hotel';

/**
 * Discounts — pos-api's Promotion + PromotionRule are the platform's discount SOURCE OF
 * TRUTH. This module talks to the tenant-facing /pos/promotions endpoints; other services
 * integrate with the same data via pos-api's /s2s/{tenant}/discounts endpoints, so a
 * discount defined anywhere applies identically everywhere.
 */

export type DiscountKind = 'code' | 'auto' | 'happy_hour';

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
}

/** Create/update payload — one shape shared with the backend's createPromoInput. */
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
  scope_ids?: string[];
  discount_type?: 'percentage' | 'fixed_amount' | 'fixed_price';
  discount_value: number;
  max_discount?: number;
}

export interface DiscountListResponse {
  data: Discount[];
  meta?: { total?: number };
  total?: number;
}

export const discountsApi = {
  /** status: 'active' | 'inactive' | 'all' (default) — 'all' lists every status for management. */
  list: (tenantSlug: string, status: string = 'all', limit = 100) =>
    apiClient.get<DiscountListResponse>(
      `/api/v1/${tenantSlug}/pos/promotions?status=${encodeURIComponent(status)}&limit=${limit}`,
    ),

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
