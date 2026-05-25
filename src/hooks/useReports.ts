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

// ─── Query keys ───────────────────────────────────────────────────────────────

export const reportKeys = {
  sales: (tid: string, from: string, to: string) => ['reports', tid, 'sales', from, to] as const,
  refunds: (tid: string, from: string, to: string) => ['reports', tid, 'refunds', from, to] as const,
  daily: (tid: string, from: string, to: string) => ['reports', tid, 'daily', from, to] as const,
  topItems: (tid: string, from: string, to: string) => ['reports', tid, 'top-items', from, to] as const,
  staffSales: (tid: string, from: string, to: string) => ['reports', tid, 'staff-sales', from, to] as const,
  shifts: (tid: string, from: string, to: string) => ['reports', tid, 'shifts', from, to] as const,
  commissions: (tid: string, from: string, to: string) => ['reports', tid, 'commissions', from, to] as const,
  tax: (tid: string, from: string, to: string) => ['reports', tid, 'tax', from, to] as const,
  salesByHour: (tid: string, from: string, to: string) => ['reports', tid, 'sales-by-hour', from, to] as const,
  salesByCategory: (tid: string, from: string, to: string) => ['reports', tid, 'sales-by-category', from, to] as const,
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

export function useReportExportUrl(tenantID: string, from: string, to: string) {
  return `/api/v1/${tenantID}/pos/reports/export?from=${from}&to=${to}`;
}
