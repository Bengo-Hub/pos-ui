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
}

export interface RefundSummary {
  refund_count: number;
  total_refunded: number;
}

export interface DayRow {
  date: string;
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
  items: ProfitableItem[];
}

export interface HourRow {
  hour: number;
  order_count: number;
  revenue: number;
}

export interface CategoryRow {
  category_name: string;
  quantity_sold: number;
  revenue: number;
}

export interface ProductMixRow {
  label: string;
  quantity: number;
  revenue: number;
  order_count: number;
}

export interface VoidRow {
  voided_by: string;
  void_count: number;
  total_voided_amount: number;
  reasons: Record<string, number>;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const reportKeys = {
  sales: (tid: string, from: string, to: string) => ['reports', tid, 'sales', from, to] as const,
  refunds: (tid: string, from: string, to: string) => ['reports', tid, 'refunds', from, to] as const,
  daily: (tid: string, from: string, to: string) => ['reports', tid, 'daily', from, to] as const,
  topItems: (tid: string, from: string, to: string) => ['reports', tid, 'top-items', from, to] as const,
  staffSales: (tid: string, from: string, to: string) => ['reports', tid, 'staff-sales', from, to] as const,
  shifts: (tid: string, from: string, to: string) => ['reports', tid, 'shifts', from, to] as const,
  shiftDetail: (tid: string, sessionId: string) => ['reports', tid, 'shift-detail', sessionId] as const,
  commissions: (tid: string, from: string, to: string) => ['reports', tid, 'commissions', from, to] as const,
  tax: (tid: string, from: string, to: string) => ['reports', tid, 'tax', from, to] as const,
  salesByHour: (tid: string, from: string, to: string) => ['reports', tid, 'sales-by-hour', from, to] as const,
  salesByCategory: (tid: string, from: string, to: string) => ['reports', tid, 'sales-by-category', from, to] as const,
  productMix: (tid: string, from: string, to: string) => ['reports', tid, 'product-mix', from, to] as const,
  voidSummary: (tid: string, from: string, to: string) => ['reports', tid, 'void-summary', from, to] as const,
  eodList: (tid: string, outletId: string, from: string, to: string) => ['reports', tid, 'eod', outletId, from, to] as const,
  stockConsumption: (tid: string, from: string, to: string) => ['reports', tid, 'stock-consumption', from, to] as const,
  returnsDetail: (tid: string, from: string, to: string) => ['reports', tid, 'returns-detail', from, to] as const,
  mostProfitable: (tid: string, from: string, to: string, limit: number) => ['reports', tid, 'most-profitable', from, to, limit] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSalesSummary(from: string, to: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.sales(tenantID, from, to),
    queryFn: () => apiClient.get<SalesSummary>(`${basePath(tenantID)}/sales-summary`, { from, to }),
    enabled: !!tenantID && !!from && !!to,
  });
}

export function useRefundSummary(from: string, to: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.refunds(tenantID, from, to),
    queryFn: () => apiClient.get<RefundSummary>(`${basePath(tenantID)}/refund-summary`, { from, to }),
    enabled: !!tenantID && !!from && !!to,
  });
}

export function useDailyBreakdown(from: string, to: string, enabled = true) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.daily(tenantID, from, to),
    queryFn: () => apiClient.get<DayRow[]>(`${basePath(tenantID)}/daily-breakdown`, { from, to }),
    enabled: !!tenantID && !!from && !!to && enabled,
  });
}

export function useTopItems(from: string, to: string, limit = 10) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.topItems(tenantID, from, to),
    queryFn: () => apiClient.get<TopItem[]>(`${basePath(tenantID)}/top-items`, { from, to, limit }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useSalesByStaff(from: string, to: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.staffSales(tenantID, from, to),
    queryFn: () => apiClient.get<StaffRow[]>(`${basePath(tenantID)}/sales-by-staff`, { from, to }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useShiftReport(from: string, to: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.shifts(tenantID, from, to),
    queryFn: () => apiClient.get<ShiftRow[]>(`${basePath(tenantID)}/shifts`, { from, to }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useCommissionReport(from: string, to: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.commissions(tenantID, from, to),
    queryFn: () => apiClient.get<CommissionRow[]>(`${basePath(tenantID)}/commissions`, { from, to }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useTaxReport(from: string, to: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.tax(tenantID, from, to),
    queryFn: () => apiClient.get<TaxRow[]>(`${basePath(tenantID)}/tax`, { from, to }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useSalesByHour(from: string, to: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.salesByHour(tenantID, from, to),
    queryFn: () => apiClient.get<HourRow[]>(`${basePath(tenantID)}/sales-by-hour`, { from, to }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useSalesByCategory(from: string, to: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.salesByCategory(tenantID, from, to),
    queryFn: () => apiClient.get<CategoryRow[]>(`${basePath(tenantID)}/sales-by-category`, { from, to }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useProductMix(from: string, to: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.productMix(tenantID, from, to),
    queryFn: () => apiClient.get<ProductMixRow[]>(`${basePath(tenantID)}/product-mix`, { from, to }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useVoidSummary(from: string, to: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.voidSummary(tenantID, from, to),
    queryFn: () => apiClient.get<VoidRow[]>(`${basePath(tenantID)}/void-summary`, { from, to }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useReportExportUrl(tenantID: string, from: string, to: string) {
  return `/api/v1/${tenantID}/pos/reports/export?from=${from}&to=${to}`;
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

export function useStockConsumptionReport(from: string, to: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.stockConsumption(tenantID, from, to),
    queryFn: () => apiClient.get<StockConsumptionRow[]>(`${basePath(tenantID)}/stock-consumption`, { from, to }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useMostProfitable(from: string, to: string, limit = 20) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.mostProfitable(tenantID, from, to, limit),
    queryFn: () => apiClient.get<MostProfitableReport>(`${basePath(tenantID)}/most-profitable`, { from, to, limit }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}

export function useReturnsDetail(from: string, to: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: reportKeys.returnsDetail(tenantID, from, to),
    queryFn: () => apiClient.get<ReturnsRow[]>(`${basePath(tenantID)}/returns`, { from, to }),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 2 * 60_000,
  });
}
