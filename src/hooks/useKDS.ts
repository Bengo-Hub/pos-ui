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

export interface KDSStation {
  id: string;
  name: string;
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
  category_filter?: string[];
  sort_order?: number;
}

export interface UpdateKDSStationInput {
  name?: string;
  category_filter?: string[];
  sort_order?: number;
  is_active?: boolean;
}

export function useKDSStations() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['kds-stations', tenantID],
    queryFn: () =>
      apiClient.get<{ data: KDSStation[] }>(`${basePath(tenantID)}/stations`),
    enabled: !!tenantID,
    staleTime: 60_000,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kds-stations', tenantID] }),
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
        params: {
          ...(filter?.stationId ? { station_id: filter.stationId } : {}),
          ...(filter?.status ? { status: filter.status } : {}),
          ...(filter?.source ? { order_source: filter.source } : {}),
        },
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

/** @deprecated Use useReadyTicket instead */
export function useBumpTicket() {
  return useReadyTicket();
}
