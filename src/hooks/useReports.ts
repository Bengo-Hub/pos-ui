'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

function basePath(tenantID: string) {
  return `/api/v1/${tenantID}/pos/reports`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SalesSummary {
  from: string;
  to: string;
  order_count: number;
  total_revenue: number;
  total_tax: number;
  total_discount: number;
  avg_order_value: number;
  gross_profit: number;
  gross_margin_pct: number;
  currency: string;
}

export interface RefundSummary {
  refund_count: number;
  total_refunded: number;
}

export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'semiannual' | 'year';

export interface DayRow {
  date: string;
  granularity?: string;
  revenue: number;
  order_count: number;
}

export interface TopItem {
  sku: string;
  name: string;
  quantity_sold: number;
  revenue: number;
}

export interface StaffRow {
  user_id: string;
  staff_name?: string;
  order_count: number;
  revenue: number;
}

export interface ShiftRow {
  shift_id: string;
  opened_at: string;
  closed_at?: string;
  cashier_name?: string;
  total_revenue: number;
  order_count: number;
}

export interface ShiftDetail {
  session_id: string;
  device_id: string;
  started_at: string;
  ended_at?: string;
  order_count: number;
  total_revenue: number;
  total_tax: number;
  total_discounts: number;
  total_refunds: number;
  net_sales: number;
  opening_cash: number;
}

export interface EODRow {
  id: string;
  outlet_id: string;
  outlet_name?: string;
  business_date: string;
  status: string;
  total_sales: number;
  total_refunds: number;
  total_discounts: number;
  total_voids: number;
  total_card: number;
  total_mpesa: number;
  total_tax: number;
  total_loyalty_redemptions: number;
  total_room_charge: number;
  total_orders: number;
  total_items_sold: number;
  cash_expected: number;
  cash_actual: number;
  variance: number;
  notes?: string;
  closed_by?: string;
  closed_at?: string;
  created_at: string;
}

export interface StockConsumptionRow {
  sku: string;
  name: string;
  quantity_consumed: number;
  uom_code: string;
  order_count: number;
}

export interface ReturnsRow {
  return_id: string;
  order_id: string;
  order_number: string;
  reason: string;
  return_type: string;
  status: string;
  amount: number;
  created_at: string;
  items_count: number;
}

export interface CommissionRow {
  user_id: string;
  rule_name?: string;
  order_count: number;
  total_sales: number;
  commission_earned: number;
}

export interface TaxRow {
  tax_name: string;
  rate: number;
  taxable_amount: number;
  tax_collected: number;
}

export interface ProfitableItem {
  sku: string;
  name: string;
  units_sold: number;
  revenue: number;
  unit_cost: number;
  profit: number;
  margin_pct: number;
}

export interface MostProfitableReport {
  currency: string;
  from: string;
  to: string;
  total_revenue: number;
  total_profit: number;
  skus_missing_cost: number;
  items: ProfitableItem[];
}

/** One row of a ?group_by= rollup — manufacturer/category/brand/outlet/staff/day/customer all
 *  share this shape (see pos-api's computeProfitabilityGroups). */
export interface ProfitabilityGroupRow {
  group: string;
  units_sold: number;
  revenue: number;
  profit: number;
  margin_pct: number;
}

export interface ProfitabilityGroupedReport {
  currency: string;
  from: string;
  to: string;
  group_by: string;
  groups: ProfitabilityGroupRow[];
  // Whole-filtered-set totals (NOT just the returned/possibly-truncated `groups` rows) — computed
  // server-side from every attributed order line before any group_by rollup or limit is applied,
  // so these agree with the Products tab's totals for the same date range regardless of which
  // dimension is selected.
  total_revenue: number;
  total_profit: number;
  skus_missing_cost: number;
}

export type ProfitabilityGroupBy = 'category' | 'brand' | 'outlet' | 'day' | 'customer' | 'staff';

export interface HourRow {
  hour: number;
  order_count: number;
  revenue: number;
  cost: number;
  profit: number;
  margin_pct: number;
}

export interface CategoryRow {
  category_name: string;
  quantity_sold: number;
  revenue: number;
}

export interface KDSStationRow {
  station_id: string;
  station_name: string;
  station_type: string;
  order_count: number;
  item_count: number;
  revenue: number;
}

export interface ProductMixRow {
  label: string;
  quantity: number;
  revenue: number;
  order_count: number;
  /** Only set on top_items rows — the item's category and resolved KDS station. */
  category?: string;
  station_name?: string;
  station_type?: string;
}

/** by_category / by_station aggregate rows — same shape as ProductMixRow, label is the
 *  category name or station name ("Unassigned" when a line has no resolved station). */
export type ProductMixAggRow = ProductMixRow;

export interface VoidRow {
  voided_by: string;
  staff_name?: string;
  void_count: number;
  total_voided_amount: number;
  reasons: Record<string, number>;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const reportKeys = {
  sales: (tid: string, from: string, to: string, outletId?: string) => ['reports', tid, 'sales', from, to, outletId] as const,
  refunds: (tid: string, from: string, to: string, outletId?: string) => ['reports', tid, 'refunds', from, to, outletId] as const,
  daily: (tid: string, from: string, to: string, outletId?: string) => ['reports', tid, 'daily', from, to, outletId] as const,
  topItems: (tid: string, from: string, to: string, outletId?: string) => ['reports', tid, 'top-items', from, to, outletId] as const,
  staffSales: (tid: string, from: string, to: string, outletId?: string) => ['reports', tid, 'staff-sales', from, to, outletId] as const,
  shifts: (tid: string, from: string, to: string, outletId?: string) => ['reports', tid, 'shifts', from, to, outletId] as const,
  shiftDetail: (tid: string, sessionId: string) => ['reports', tid, 'shift-detail', sessionId] as const,
  commissions: (tid: string, from: string, to: string, outletId?: string) => ['reports', tid, 'commissions', from, to, outletId] as const,
  tax: (tid: string, from: string, to: string, outletId?: string) => ['reports', tid, 'tax', from, to, outletId] as const,
  salesByHour: (tid: string, date: string, outletId?: string) => ['reports', tid, 'sales-by-hour', date, outletId] as const,
  salesByCategory: (tid: string, from: string, to: string, outletId?: string) => ['reports', tid, 'sales-by-category', from, to, outletId] as const,
  salesByKDSStation: (tid: string, from: string, to: string, outletId?: string) => ['reports', tid, 'sales-by-kds-station', from, to, outletId] as const,
  productMix: (tid: string, from: string, to: string, outletId?: string) => ['reports', tid, 'product-mix', from, to, outletId] as const,
  voidSummary: (tid: string, from: string, to: string, outletId?: string) => ['reports', tid, 'void-summary', from, to, outletId] as const,
  eodList: (tid: string, outletId: string, from: string, to: string) => ['reports', tid, 'eod', outletId, from, to] as const,
  stockConsumption: (tid: string, from: string, to: string, outletId?: string) => ['reports', tid, 'stock-consumption', from, to, outletId] as const,
  returnsDetail: (tid: string, from: string, to: string, outletId?: string) => ['reports', tid, 'returns-detail', from, to, outletId] as const,
  mostProfitable: (tid: string, from: string, to: string, limit: number, outletId?: string) => ['reports', tid, 'most-profitable', from, to, limit, outletId] as const,
  profitabilityGrouped: (tid: string, from: string, to: string, groupBy: string, outletId?: string) => ['reports', tid, 'most-profitable', 'grouped', groupBy, from, to, outletId] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSalesSummary(from: string, to: string, outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.sales(tenantID, from, to, outletId),
    queryFn: () => apiClient.get<SalesSummary>(`${basePath(tenantID)}/sales-summary`, { from, to, outlet_id: outletId }),
    enabled: !!tenantID && !!from && !!to,
  });
}

export function useRefundSummary(from: string, to: string, outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.refunds(tenantID, from, to, outletId),
    queryFn: () => apiClient.get<RefundSummary>(`${basePath(tenantID)}/refund-summary`, { from, to, outlet_id: outletId }),
    enabled: !!tenantID && !!from && !!to,
  });
}

export function useDailyBreakdown(from: string, to: string, enabled = true, granularity: Granularity = 'day', outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: [...reportKeys.daily(tenantID, from, to, outletId), granularity],
    queryFn: async () => {
      const res = await apiClient.get<DayRow[] | { data?: DayRow[] }>(`${basePath(tenantID)}/daily-breakdown`, { from, to, granularity, outlet_id: outletId });
      return Array.isArray(res) ? res : res?.data ?? [];
    },
    enabled: !!tenantID && !!from && !!to && enabled,
  });
}

export function useTopItems(from: string, to: string, limit = 10, outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.topItems(tenantID, from, to, outletId),
    queryFn: () => apiClient.get<TopItem[]>(`${basePath(tenantID)}/top-items`, { from, to, limit, outlet_id: outletId }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useSalesByStaff(from: string, to: string, outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.staffSales(tenantID, from, to, outletId),
    queryFn: () => apiClient.get<StaffRow[]>(`${basePath(tenantID)}/sales-by-staff`, { from, to, outlet_id: outletId }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useShiftReport(from: string, to: string, outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.shifts(tenantID, from, to, outletId),
    // The backend wraps this list in a `{data, total}` envelope (ShiftReportList), not a bare
    // array — every caller here destructures `data: rows = []` expecting a real array, so an
    // un-unwrapped envelope object silently became `rows` itself: iterating/mapping it then threw
    // "is not iterable"/"map is not a function" (hit live on the Shifts "Team" tab).
    queryFn: async () => {
      const res = await apiClient.get<{ data?: ShiftRow[] } | ShiftRow[]>(`${basePath(tenantID)}/shifts`, { from, to, outlet_id: outletId });
      return Array.isArray(res) ? res : res.data ?? [];
    },
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useCommissionReport(from: string, to: string, outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.commissions(tenantID, from, to, outletId),
    queryFn: () => apiClient.get<CommissionRow[]>(`${basePath(tenantID)}/commissions`, { from, to, outlet_id: outletId }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useTaxReport(from: string, to: string, outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.tax(tenantID, from, to, outletId),
    queryFn: () => apiClient.get<TaxRow[]>(`${basePath(tenantID)}/tax`, { from, to, outlet_id: outletId }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

// Sales by Hour is a single-day breakdown (pos-api reads ?date=, not a from/to range) — the
// hour-of-day buckets only make sense for one specific day, so this takes its own `date` filter
// rather than the shared report date range.
export function useSalesByHour(date: string, outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.salesByHour(tenantID, date, outletId),
    // Backend returns { date, hours: [...] } — unwrap to the array the UI maps over.
    queryFn: async () => {
      const res = await apiClient.get<{ hours?: HourRow[] } | HourRow[]>(`${basePath(tenantID)}/sales-by-hour`, { date, outlet_id: outletId });
      return Array.isArray(res) ? res : res?.hours ?? [];
    },
    enabled: !!tenantID && !!date,
    staleTime: 2 * 60_000,
  });
}

export function useSalesByCategory(from: string, to: string, outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.salesByCategory(tenantID, from, to, outletId),
    // Backend returns { data: [...], total } — unwrap to the array the UI maps over.
    queryFn: async () => {
      const res = await apiClient.get<{ data?: CategoryRow[] } | CategoryRow[]>(`${basePath(tenantID)}/sales-by-category`, { from, to, outlet_id: outletId });
      return Array.isArray(res) ? res : res?.data ?? [];
    },
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

/** Sales grouped by KDS station (kitchen vs bar, etc.) — the same grouping the kitchen/bar
 *  displays use, so this always matches what actually printed/showed at each station. */
export function useSalesByKDSStation(from: string, to: string, outletId?: string, enabled = true) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.salesByKDSStation(tenantID, from, to, outletId),
    // Backend returns { data: [...], total } — unwrap to the array the UI maps over.
    queryFn: async () => {
      const res = await apiClient.get<{ data?: KDSStationRow[] } | KDSStationRow[]>(
        `${basePath(tenantID)}/sales/by-kds-station`,
        { from, to, outlet_id: outletId },
      );
      return Array.isArray(res) ? res : res?.data ?? [];
    },
    enabled: !!tenantID && !!from && !!to && enabled,
    staleTime: 2 * 60_000,
  });
}

export interface ProductMixResult {
  items: ProductMixRow[];
  byCategory: ProductMixAggRow[];
  byStation: ProductMixAggRow[];
}

const EMPTY_PRODUCT_MIX: ProductMixResult = { items: [], byCategory: [], byStation: [] };

export function useProductMix(from: string, to: string, outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.productMix(tenantID, from, to, outletId),
    // Backend returns { from, to, by_subtype, top_items, by_category, by_station } — the
    // product-level table uses top_items; by_category/by_station feed the mix charts + filters.
    queryFn: async () => {
      const res = await apiClient.get<Partial<{
        top_items: ProductMixRow[]; by_category: ProductMixAggRow[]; by_station: ProductMixAggRow[];
      }> | ProductMixRow[]>(`${basePath(tenantID)}/product-mix`, { from, to, outlet_id: outletId });
      if (Array.isArray(res)) return { items: res, byCategory: [], byStation: [] };
      return { items: res?.top_items ?? [], byCategory: res?.by_category ?? [], byStation: res?.by_station ?? [] };
    },
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
    placeholderData: EMPTY_PRODUCT_MIX,
  });
}

export function useVoidSummary(from: string, to: string, outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.voidSummary(tenantID, from, to, outletId),
    // Backend returns { from, to, items: [...] } — unwrap to the array the UI maps over.
    queryFn: async () => {
      const res = await apiClient.get<{ items?: VoidRow[] } | VoidRow[]>(`${basePath(tenantID)}/void-summary`, { from, to, outlet_id: outletId });
      return Array.isArray(res) ? res : res?.items ?? [];
    },
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

// ─── Register Details (GoDigital-style detailed register report) ────────────────
export interface PaymentMethodRow { method: string; sell_amount: number; expense_amount: number }
export interface ProductSoldRow { sku: string; name: string; quantity: number; total_amount: number }
export interface BrandSoldRow { brand: string; quantity: number; total_amount: number }
export interface RegisterDetails {
  from: string;
  to: string;
  payment_methods: PaymentMethodRow[];
  total_sales: number;
  total_refund: number;
  refund_by_method: PaymentMethodRow[];
  total_payment: number;
  credit_sales: number;
  total_expense: number;
  order_tax: number;
  shipping_total: number;
  grand_total: number;
  order_count: number;
  refund_count: number;
  products_sold: ProductSoldRow[];
  products_by_brand: BrandSoldRow[];
}

/** Detailed register report powering the POS "Register Details" modal. */
export function useRegisterDetails(from: string, to: string, outletId?: string, enabled = true) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['reports', tenantID, 'register-details', from, to, outletId],
    queryFn: () =>
      apiClient.get<RegisterDetails>(`${basePath(tenantID)}/register-details`, { from, to, outlet_id: outletId }),
    enabled: !!tenantID && !!from && !!to && enabled,
    staleTime: 30_000,
    // Go serializes empty/nil slices as JSON null — a register window with no payments/
    // refunds/products arrives with null arrays and `.map` crashes the modal. Normalize
    // every list field to [] at the data boundary so the declared types actually hold.
    select: (d): RegisterDetails => ({
      ...d,
      payment_methods: d.payment_methods ?? [],
      refund_by_method: d.refund_by_method ?? [],
      products_sold: d.products_sold ?? [],
      products_by_brand: d.products_by_brand ?? [],
    }),
  });
}

export function useReportExportUrl(tenantID: string, from: string, to: string) {
  return `/api/v1/${tenantID}/pos/reports/export?from=${from}&to=${to}`;
}

/**
 * Download the sales CSV through the AUTHENTICATED api client and save it via a temporary
 * object URL. A bare <a href download> navigated the browser to the export endpoint WITHOUT
 * the bearer token → 401 → "file wasn't available on site". This fetches the blob with auth
 * and triggers a real file save.
 */
export async function downloadReportCSV(tenantID: string, from: string, to: string): Promise<void> {
  const blob = await apiClient.getBlob(`${basePath(tenantID)}/export`, { from, to });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sales-${from}-${to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function useShiftReportDetail(sessionId: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.shiftDetail(tenantID, sessionId),
    queryFn: () => apiClient.get<ShiftDetail>(`${basePath(tenantID)}/shifts/${sessionId}`),
    enabled: !!tenantID && !!sessionId,
    staleTime: 2 * 60_000,
  });
}

export function useEODList(outletId: string, from: string, to: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.eodList(tenantID, outletId, from, to),
    queryFn: () => apiClient.get<EODRow[]>(
      `/api/v1/${tenantID}/pos/outlets/${outletId}/daily-closings`,
      { from, to },
    ),
    enabled: !!tenantID && !!outletId && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useStockConsumptionReport(from: string, to: string, outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.stockConsumption(tenantID, from, to, outletId),
    queryFn: () => apiClient.get<StockConsumptionRow[]>(`${basePath(tenantID)}/stock-consumption`, { from, to, outlet_id: outletId }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useMostProfitable(from: string, to: string, limit = 20, outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.mostProfitable(tenantID, from, to, limit, outletId),
    queryFn: () => apiClient.get<MostProfitableReport>(`${basePath(tenantID)}/most-profitable`, { from, to, limit, outlet_id: outletId }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

/** Backs every non-Products tab of the Profitability page — SAME endpoint as useMostProfitable,
 *  just with ?group_by= set, so it can never disagree with the Products ranking for the same
 *  date range (both read the identical AttributeOrderLines/cost machinery server-side). */
export function useProfitabilityGrouped(from: string, to: string, groupBy: ProfitabilityGroupBy, outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.profitabilityGrouped(tenantID, from, to, groupBy, outletId),
    queryFn: () => apiClient.get<ProfitabilityGroupedReport>(`${basePath(tenantID)}/most-profitable`, { from, to, group_by: groupBy, outlet_id: outletId }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useReturnsDetail(from: string, to: string, outletId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.returnsDetail(tenantID, from, to, outletId),
    queryFn: () => apiClient.get<ReturnsRow[]>(`${basePath(tenantID)}/returns`, { from, to, outlet_id: outletId }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}
