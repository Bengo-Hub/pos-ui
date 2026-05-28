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
  tax_status?: string;
  status?: string;
  is_available?: boolean;
  is_featured?: boolean;
  display_order?: number;
  image_url?: string;
  barcode?: string;
  price?: number;
  requires_age_verification?: boolean;
  track_serial_numbers?: boolean;
  requires_prescription?: boolean;
  is_controlled_substance?: boolean;
  minimum_age?: number;
  is_returnable?: boolean;
  outlet_id?: string;
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

export function useCategories() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-categories', tenantID],
    queryFn: () =>
      apiClient.get<{ data: string[] }>(`${basePath(tenantID)}/catalog/categories`),
    enabled: !!tenantID,
    staleTime: 10 * 60_000,
    select: (res) => res.data ?? [],
  });
}

// ─── Sections ───────────────────────────────────────────────────────────────

interface Section {
  id: string;
  name: string;
  slug: string;
  section_type: string;
  floor_number: number;
  sort_order: number;
  is_active: boolean;
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
  table_type: string;
  section_id?: string;
  x_position?: number;
  y_position?: number;
  tags?: string[];
  occupied_since?: string;
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

export function useCreateSection() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { outletId: string; name: string; sectionType?: string; floorNumber?: number; sortOrder?: number }) =>
      apiClient.post<Section>(`${basePath(tenantID)}/sections`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-sections'] }),
  });
}

export function useUpdateSection() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, input }: { sectionId: string; input: { name?: string; isActive?: boolean } }) =>
      apiClient.put<Section>(`${basePath(tenantID)}/sections/${sectionId}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-sections'] }),
  });
}

export function useCreateTable() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { outletId: string; sectionId?: string; name: string; capacity: number; tableType?: string }) =>
      apiClient.post<Table>(`${basePath(tenantID)}/tables`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
      qc.invalidateQueries({ queryKey: ['pos-sections'] });
    },
  });
}

export function useUpdateTable() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, input }: { tableId: string; input: { name?: string; capacity?: number; tableType?: string; isActive?: boolean; xPosition?: number; yPosition?: number; sectionId?: string } }) =>
      apiClient.put<Table>(`${basePath(tenantID)}/tables/${tableId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
      qc.invalidateQueries({ queryKey: ['pos-sections'] });
    },
  });
}

export function useDeleteTable() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tableId: string) =>
      apiClient.delete(`${basePath(tenantID)}/tables/${tableId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
      qc.invalidateQueries({ queryKey: ['pos-sections'] });
    },
  });
}

export function useDeleteSection() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) =>
      apiClient.delete(`${basePath(tenantID)}/sections/${sectionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-sections'] });
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
    },
  });
}

export type { Section, Table };

// ─── Table Reservations ──────────────────────────────────────────────────────

export interface TableReservation {
  id: string;
  tenant_id: string;
  outlet_id: string;
  table_id?: string;
  guest_name: string;
  guest_phone?: string;
  guest_email?: string;
  party_size: number;
  scheduled_at: string;
  duration_minutes: number;
  status: 'pending' | 'confirmed' | 'checked_in' | 'cancelled' | 'no_show';
  notes?: string;
  special_requests?: string;
  source: string;
  cancellation_reason?: string;
  confirmed_at?: string;
  checked_in_at?: string;
  cancelled_at?: string;
  created_at: string;
}

export interface CreateReservationInput {
  outlet_id: string;
  table_id?: string;
  guest_name: string;
  guest_phone?: string;
  guest_email?: string;
  party_size: number;
  scheduled_at: string; // RFC3339
  duration_minutes?: number;
  notes?: string;
  special_requests?: string;
  source?: string;
}

export function useReservations(filters?: { date?: string; status?: string; outletId?: string; tableId?: string }) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-reservations', tenantID, filters],
    queryFn: () =>
      apiClient.get<{ data: TableReservation[]; total: number }>(`${basePath(tenantID)}/reservations`, {
        date: filters?.date,
        status: filters?.status,
        outlet_id: filters?.outletId,
        table_id: filters?.tableId,
      }),
    enabled: !!tenantID,
    staleTime: 15_000,
  });
}

export function useAvailableSlots(params: { date: string; partySize?: number; outletId?: string }) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-available-slots', tenantID, params],
    queryFn: () =>
      apiClient.get<{ date: string; tables: any[] }>(`${basePath(tenantID)}/reservations/available`, {
        date: params.date,
        party_size: params.partySize,
        outlet_id: params.outletId,
      }),
    enabled: !!tenantID && !!params.date,
    staleTime: 30_000,
  });
}

export function useCreateReservation() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReservationInput) =>
      apiClient.post<TableReservation>(`${basePath(tenantID)}/reservations`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-reservations'] });
      qc.invalidateQueries({ queryKey: ['pos-available-slots'] });
    },
  });
}

export function useUpdateReservation() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateReservationInput> }) =>
      apiClient.patch<TableReservation>(`${basePath(tenantID)}/reservations/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-reservations'] }),
  });
}

export function useConfirmReservation() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tableId }: { id: string; tableId?: string }) =>
      apiClient.post<TableReservation>(`${basePath(tenantID)}/reservations/${id}/confirm`, { table_id: tableId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-reservations'] });
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
    },
  });
}

export function useCheckInReservation() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<TableReservation>(`${basePath(tenantID)}/reservations/${id}/check-in`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-reservations'] });
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
    },
  });
}

export function useCancelReservation() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiClient.post<TableReservation>(`${basePath(tenantID)}/reservations/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-reservations'] });
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
      qc.invalidateQueries({ queryKey: ['pos-available-slots'] });
    },
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

export function useOrder(id: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-order', tenantID, id],
    queryFn: () => apiClient.get<POSOrder>(`${basePath(tenantID)}/orders/${id}`),
    enabled: !!tenantID && !!id,
  });
}

export function useOrders(filters?: { status?: string; staffId?: string; limit?: number }) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-orders', tenantID, filters],
    queryFn: () =>
      apiClient.get<{ data: POSOrder[]; total: number }>(`${basePath(tenantID)}/orders`, {
        status: filters?.status,
        staff_id: filters?.staffId,
        limit: filters?.limit,
      }),
    enabled: !!tenantID,
    staleTime: 15_000,
  });
}

export type OrderSubtype = 'dine_in' | 'takeaway' | 'room_service' | 'delivery' | 'bar_tab';

interface CreateOrderInput {
  outletId: string;
  deviceId?: string;
  currency?: string;
  orderSubtype?: OrderSubtype;
  tableId?: string;
  coversCount?: number;
  lines: Array<{
    catalog_item_id: string;
    sku: string;
    name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    course_number?: number;
    metadata?: Record<string, unknown>;
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
        order_subtype: data.orderSubtype ?? 'dine_in',
        table_id: data.tableId,
        covers_count: data.coversCount,
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

export function useAddOrderLines() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, lines }: { orderId: string; lines: CreateOrderInput['lines'] }) =>
      apiClient.post(`${basePath(tenantID)}/orders/${orderId}/lines`, { lines }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-orders'] });
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
    },
  });
}

export function useMergeTables() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ primaryTableId, secondaryTableId }: { primaryTableId: string; secondaryTableId: string }) =>
      apiClient.post(`${basePath(tenantID)}/tables/merge`, {
        primary_table_id: primaryTableId,
        secondary_table_id: secondaryTableId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-tables'] }),
  });
}

export function useUnmergeTables() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ primaryTableId, secondaryTableId, lineIds }: { primaryTableId: string; secondaryTableId: string; lineIds: string[] }) =>
      apiClient.post(`${basePath(tenantID)}/tables/unmerge`, {
        primary_table_id: primaryTableId,
        secondary_table_id: secondaryTableId,
        line_ids: lineIds,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-tables'] }),
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
