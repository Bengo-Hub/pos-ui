'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

function basePath(tenantID: string) {
  return `/api/v1/${tenantID}/pos/kds`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type KDSTicketStatus = 'pending' | 'in_progress' | 'ready' | 'served' | 'voided';

export type OrderSource = 'pos' | 'online';

export type KDSStationType = 'kitchen' | 'bar' | 'cold' | 'expo' | 'all';

export interface KDSStation {
  id: string;
  name: string;
  station_type: KDSStationType;
  sort_order: number;
  is_active: boolean;
  category_filter: string[];
}

export interface KDSTicketItem {
  line_id: string;
  sku: string;
  name: string;
  qty: number;
  kds_status?: string;
}

export interface KDSTicket {
  id: string;
  order_id: string;
  order_number: string;
  station_id: string;
  status: KDSTicketStatus;
  /** Source of the order: 'pos' for in-restaurant, 'online' for ordering-backend orders */
  order_source?: OrderSource;
  /** Table number or online channel label (e.g. "Table 5", "Online - Uber Eats") */
  order_label?: string;
  /** dine_in | takeaway | delivery | room_service | bar_tab — drives the order-type filter */
  order_subtype?: string;
  items: KDSTicketItem[];
  received_at: string;
  started_at?: string;
  completed_at?: string;
  priority: number;
}

// ─── Stations ────────────────────────────────────────────────────────────────

export interface CreateKDSStationInput {
  outlet_id: string;
  name: string;
  station_type?: KDSStationType;
  category_filter?: string[];
  sort_order?: number;
}

export interface UpdateKDSStationInput {
  name?: string;
  station_type?: KDSStationType;
  category_filter?: string[];
  sort_order?: number;
  is_active?: boolean;
}

/** Active stations only (for KDS display). */
// `enabled` lets callers skip the fetch entirely when the outlet's use-case/plan can never satisfy
// the backend's RequireUseCase("hospitality","quick_service")/RequireFeature("kds") gate (e.g. a
// retail-only plan) — calling it anyway is a guaranteed 403, and every failed attempt independently
// fires the app's subscription-403 toast, not just the first.
export function useKDSStations(enabled = true) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['kds-stations', tenantID],
    queryFn: () =>
      apiClient.get<{ data: KDSStation[] }>(`${basePath(tenantID)}/stations`),
    enabled: !!tenantID && enabled,
    staleTime: 60_000,
  });
}

/** All stations including inactive — used by the settings/management UI. */
export function useAllKDSStations() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['kds-stations-all', tenantID],
    queryFn: () =>
      apiClient.get<{ data: KDSStation[] }>(`${basePath(tenantID)}/stations`, { all: 'true' }),
    enabled: !!tenantID,
    staleTime: 30_000,
  });
}

export function useCreateKDSStation() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateKDSStationInput) =>
      apiClient.post<KDSStation>(`${basePath(tenantID)}/stations`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kds-stations', tenantID] }),
  });
}

export function useUpdateKDSStation() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stationID, input }: { stationID: string; input: UpdateKDSStationInput }) =>
      apiClient.put<KDSStation>(`${basePath(tenantID)}/stations/${stationID}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kds-stations'] });
      qc.invalidateQueries({ queryKey: ['kds-stations-all'] });
    },
  });
}

export function useDeleteKDSStation() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stationID: string) =>
      apiClient.delete(`${basePath(tenantID)}/stations/${stationID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kds-stations'] });
      qc.invalidateQueries({ queryKey: ['kds-stations-all'] });
    },
  });
}

// ─── Item → Station assignment ────────────────────────────────────────────────
// The priority-1 explicit routing override (POSCatalogOverride.kds_station_id) — wins over both
// the hot-beverage guard and category_filter matching in resolveStationForLine. Distinct base
// path from the /kds/* routes above: this hits the catalog endpoints (pos-api's CatalogHandler).

export interface SetCatalogItemKDSStationInput {
  sku: string;
  /** Omit/empty clears the override, reverting the item to category_filter/hot-beverage routing. */
  station_id?: string;
  outlet_id?: string;
}

export function useSetCatalogItemKDSStation() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetCatalogItemKDSStationInput) =>
      apiClient.patch(`/api/v1/${tenantID}/pos/catalog/items/kds-station`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-catalog-items'] }),
  });
}

// ─── Kitchen Queue ────────────────────────────────────────────────────────────

export function useKitchenQueue() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['kds-kitchen', tenantID],
    queryFn: () =>
      apiClient.get<{ data: KDSTicket[] }>(`${basePath(tenantID)}/kitchen`),
    enabled: !!tenantID,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

// ─── Bar Queue ───────────────────────────────────────────────────────────────

export function useBarQueue() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['kds-bar', tenantID],
    queryFn: () =>
      apiClient.get<{ data: KDSTicket[] }>(`${basePath(tenantID)}/bar`),
    enabled: !!tenantID,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

// ─── All Tickets (with station + source filter) ───────────────────────────────

export interface KDSTicketsFilter {
  stationId?: string;
  status?: KDSTicketStatus;
  source?: OrderSource;
}

export function useKDSTickets(filter?: KDSTicketsFilter) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['kds-tickets', tenantID, filter],
    queryFn: () =>
      apiClient.get<{ data: KDSTicket[] }>(`${basePath(tenantID)}/tickets`, {
        ...(filter?.stationId ? { station_id: filter.stationId } : {}),
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.source ? { order_source: filter.source } : {}),
      }),
    enabled: !!tenantID,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

// ─── Ticket Actions ───────────────────────────────────────────────────────────

export function useStartTicket() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) =>
      apiClient.post(`${basePath(tenantID)}/tickets/${ticketId}/start`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kds-tickets'] });
      qc.invalidateQueries({ queryKey: ['kds-kitchen'] });
      qc.invalidateQueries({ queryKey: ['kds-bar'] });
    },
  });
}

export function useReadyTicket() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) =>
      apiClient.post(`${basePath(tenantID)}/tickets/${ticketId}/ready`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kds-tickets'] });
      qc.invalidateQueries({ queryKey: ['kds-kitchen'] });
      qc.invalidateQueries({ queryKey: ['kds-bar'] });
    },
  });
}

export function useServeTicket() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) =>
      apiClient.post(`${basePath(tenantID)}/tickets/${ticketId}/serve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kds-tickets'] });
      qc.invalidateQueries({ queryKey: ['kds-kitchen'] });
      qc.invalidateQueries({ queryKey: ['kds-bar'] });
    },
  });
}

export function useCallWaiter() {
  const tenantID = useTenantID();
  return useMutation({
    mutationFn: (ticketId: string) =>
      apiClient.post(`${basePath(tenantID)}/tickets/${ticketId}/call-waiter`),
  });
}

export function useVoidTicket() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) =>
      apiClient.post(`${basePath(tenantID)}/tickets/${ticketId}/void`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kds-tickets'] });
      qc.invalidateQueries({ queryKey: ['kds-kitchen'] });
      qc.invalidateQueries({ queryKey: ['kds-bar'] });
    },
  });
}

/**
 * useClearBoard bulk-serves all active tickets for the current outlet (optionally only those
 * older than `olderThanHours`). Lets a manager clear a cluttered board from a single terminal —
 * essential when the kitchen has no device to bump tickets one by one.
 */
export function useClearBoard() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ cleared: number }>(`${basePath(tenantID)}/tickets/clear`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kds-tickets'] });
      qc.invalidateQueries({ queryKey: ['kds-kitchen'] });
      qc.invalidateQueries({ queryKey: ['kds-bar'] });
    },
  });
}

/** @deprecated Use useReadyTicket instead */
export function useBumpTicket() {
  return useReadyTicket();
}
