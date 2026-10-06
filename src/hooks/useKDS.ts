'use client';

import { apiClient } from '@/lib/api/client';
import type { JobHeader } from '@/lib/api/service-jobs';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { KDSChannel } from '@/lib/kds/board';

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
  /** pos-api stores `quantity`; `qty` is kept for older tickets/clients. */
  quantity?: number;
  qty?: number;
  /** Selected modifiers ("Milk: Oat", "No onions") and free-text notes for this plate. */
  modifiers?: string[];
  notes?: string;
  kds_status?: string;
  /** Services job lines: the spec sheet captured at reception (size, material, vehicle reg...). */
  job_specs?: Record<string, string>;
}

export interface KDSTicket {
  id: string;
  order_id: string;
  order_number: string;
  station_id: string;
  status: KDSTicketStatus;
  /** Source of the order: 'pos' for in-restaurant, 'online' for ordering-backend orders */
  order_source?: OrderSource;
  /** How the order reaches the customer (pos-api orderchannel); the board groups on this only. */
  channel?: KDSChannel;
  /** Route label: "Table 5", "Room 204", "Online delivery for Fri 18:30". */
  order_label?: string;
  /** POS order subtype stored on the ticket. */
  order_subtype?: string;
  table_reference?: string;
  /** Customer name for takeaway, delivery and online orders (the counter calls them by name). */
  customer_name?: string;
  /** Customer notes for the whole order (online orders). */
  order_notes?: string;
  /** Services job orders: customer, payment position and the job header (stage, due, brief, attachments). */
  job?: {
    customer_name?: string;
    customer_phone?: string;
    total_amount: number;
    paid_total: number;
    details?: JobHeader;
  };
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

// ─── Tickets ──────────────────────────────────────────────────────────────────
// One list per outlet. The board filters by station and channel on the client (lib/kds/board)
// so every count it shows comes from the same rows.

export interface KDSTicketsFilter {
  stationId?: string;
  status?: KDSTicketStatus;
  /** Recency window in hours (server default 24). 0 shows every active ticket: a services
   *  production board holds multi-day jobs that must not drop off after a day. */
  sinceHours?: number;
}

export function useKDSTickets(filter?: KDSTicketsFilter) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['kds-tickets', tenantID, filter],
    queryFn: () =>
      apiClient.get<{ data: KDSTicket[] }>(`${basePath(tenantID)}/tickets`, {
        ...(filter?.stationId ? { station_id: filter.stationId } : {}),
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.sinceHours != null ? { since_hours: String(filter.sinceHours) } : {}),
      }),
    enabled: !!tenantID,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

// ─── Ticket Actions ───────────────────────────────────────────────────────────

/** One mutation shape for every ticket transition; each refreshes the board list. */
function useTicketTransition(action: 'start' | 'ready' | 'serve') {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) =>
      apiClient.post(`${basePath(tenantID)}/tickets/${ticketId}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kds-tickets'] }),
  });
}

export const useStartTicket = () => useTicketTransition('start');
export const useReadyTicket = () => useTicketTransition('ready');
export const useServeTicket = () => useTicketTransition('serve');

export function useCallWaiter() {
  const tenantID = useTenantID();
  return useMutation({
    mutationFn: (ticketId: string) =>
      apiClient.post(`${basePath(tenantID)}/tickets/${ticketId}/call-waiter`),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kds-tickets'] }),
  });
}
