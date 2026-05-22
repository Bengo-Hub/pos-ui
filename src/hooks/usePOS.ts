'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Get tenant ID from auth store
function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

function basePath(tenantID: string) {
  return `/api/v1/${tenantID}/pos`;
}

// ─── Catalog Items ──────────────────────────────────────────────────────────

export interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category: string;
  item_type?: string;
  duration_minutes?: number;
  taxStatus: string;
  status: string;
  image_url?: string;
  barcode?: string;
  price?: number;
  metadata?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  page: number;
}

export function useMenuItems(filters?: {
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const tenantID = useTenantID();
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 50;
  return useQuery({
    queryKey: ['pos-catalog-items', tenantID, filters?.category, filters?.search, page, limit],
    queryFn: () =>
      apiClient.get<PaginatedResponse<CatalogItem>>(`${basePath(tenantID)}/catalog/items`, {
        category: filters?.category,
        search: filters?.search,
        page,
        limit,
      }),
    enabled: !!tenantID,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useCreateMenuItem() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sku: string; name: string; category: string }) =>
      apiClient.post(`${basePath(tenantID)}/catalog/items`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-catalog-items'] }),
  });
}

// ─── Sections ───────────────────────────────────────────────────────────────

interface Section {
  id: string;
  name: string;
  slug: string;
  sectionType: string;
  floorNumber: number;
  sortOrder: number;
  isActive: boolean;
  edges?: { tables?: Table[] };
}

export function useSections() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-sections', tenantID],
    queryFn: () => apiClient.get<PaginatedResponse<Section>>(`${basePath(tenantID)}/sections`),
    enabled: !!tenantID,
    staleTime: 30_000,
  });
}

// ─── Tables ─────────────────────────────────────────────────────────────────

interface Table {
  id: string;
  name: string;
  capacity: number;
  status: string;
  tableType: string;
  xPosition?: number;
  yPosition?: number;
  tags?: string[];
  edges?: { section?: Section };
}

export function useTables(filters?: { status?: string; sectionId?: string }) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-tables', tenantID, filters],
    queryFn: () =>
      apiClient.get<PaginatedResponse<Table>>(`${basePath(tenantID)}/tables`, {
        status: filters?.status,
        section_id: filters?.sectionId,
      }),
    enabled: !!tenantID,
    staleTime: 10_000,
  });
}

export function useUpdateTableStatus() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, status }: { tableId: string; status: string }) =>
      apiClient.patch(`${basePath(tenantID)}/tables/${tableId}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-tables'] }),
  });
}

export function useAssignTable() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, orderId }: { tableId: string; orderId: string }) =>
      apiClient.post(`${basePath(tenantID)}/tables/${tableId}/assign`, { orderId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-tables'] }),
  });
}

export function useReleaseTable() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tableId: string) =>
      apiClient.post(`${basePath(tenantID)}/tables/${tableId}/release`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-tables'] }),
  });
}

// ─── Orders ─────────────────────────────────────────────────────────────────

interface POSOrder {
  id: string;
  order_number: string;
  status: string;
  subtotal: number;
  tax_total: number;
  total_amount: number;
  currency: string;
  created_at: string;
  edges?: { lines?: any[]; payments?: any[] };
}

export function useOrders(filters?: { status?: string }) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-orders', tenantID, filters],
    queryFn: () =>
      apiClient.get<{ orders: POSOrder[]; total: number }>(`${basePath(tenantID)}/orders`, {
        status: filters?.status,
      }),
    enabled: !!tenantID,
    staleTime: 15_000,
  });
}

interface CreateOrderInput {
  outletId: string;
  deviceId?: string;
  currency?: string;
  lines: Array<{
    catalog_item_id: string;
    sku: string;
    name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
}

export function useCreateOrder() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateOrderInput) =>
      apiClient.post(`${basePath(tenantID)}/orders`, {
        outlet_id: data.outletId,
        device_id: data.deviceId,
        currency: data.currency ?? 'KES',
        lines: data.lines,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-orders'] }),
  });
}

export function useUpdateOrderStatus() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      apiClient.patch(`${basePath(tenantID)}/orders/${orderId}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-orders'] }),
  });
}

export function useVoidOrder() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      apiClient.patch(`${basePath(tenantID)}/orders/${orderId}/void`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-orders'] }),
  });
}

// ─── Tenders ────────────────────────────────────────────────────────────────

interface Tender {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
}

export function useTenders() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-tenders', tenantID],
    queryFn: () => apiClient.get<PaginatedResponse<Tender>>(`${basePath(tenantID)}/tenders`),
    enabled: !!tenantID,
    staleTime: 5 * 60_000,
  });
}

// ─── Payments ───────────────────────────────────────────────────────────────

export interface PaymentIntentResult {
  payment_intent_id: string;
  initiate_url: string;
  is_cash: boolean;
}

export function useCreatePaymentIntent() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      tenderMethod,
      amount,
      tenderId,
      currency,
      externalRef,
    }: {
      orderId: string;
      tenderMethod: string;
      amount: number;
      tenderId?: string;
      currency?: string;
      externalRef?: string; // cashier-entered reference for manual/paybill payments
    }) =>
      apiClient.post<PaymentIntentResult>(`${basePath(tenantID)}/orders/${orderId}/payments/intent`, {
        tenderMethod,
        tenderId: tenderId ?? '00000000-0000-0000-0000-000000000000',
        amount,
        currency: currency ?? 'KES',
        externalRef,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-orders'] });
    },
  });
}

export function useRecordPayment() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, tenderId, amount }: { orderId: string; tenderId: string; amount: number }) =>
      apiClient.post(`${basePath(tenantID)}/orders/${orderId}/payments`, {
        tenderId,
        amount,
        currency: 'KES',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-orders'] });
    },
  });
}

// ─── Cash Drawer ────────────────────────────────────────────────────────────

interface CashDrawer {
  id: string;
  status: string;
  starting_cash: number;
  ending_cash: number;
  opened_at: string;
  closed_at?: string;
}

export function useCurrentDrawer() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-drawer-current', tenantID],
    queryFn: () =>
      apiClient.get<{ drawer: CashDrawer | null; isOpen: boolean }>(`${basePath(tenantID)}/drawers/current`),
    enabled: !!tenantID,
    staleTime: 5_000,
  });
}

export function useOpenDrawer() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { outletId: string; startingCash: number }) =>
      apiClient.post(`${basePath(tenantID)}/drawers/open`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-drawer-current'] }),
  });
}

export function useCloseDrawer() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ drawerId, endingCash }: { drawerId: string; endingCash: number }) =>
      apiClient.post(`${basePath(tenantID)}/drawers/${drawerId}/close`, { endingCash }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-drawer-current'] }),
  });
}

export function useDrawerHistory() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-drawer-history', tenantID],
    queryFn: () =>
      apiClient.get<PaginatedResponse<CashDrawer>>(`${basePath(tenantID)}/drawers`),
    enabled: !!tenantID,
    staleTime: 30_000,
  });
}
