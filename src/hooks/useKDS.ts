'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

function basePath(tenantID: string) {
  return `/api/v1/${tenantID}/kds`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KDSStation {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

export interface KDSTicketItem {
  id: string;
  name: string;
  quantity: number;
  modifiers?: string[];
}

export interface KDSTicket {
  id: string;
  order_id: string;
  order_number: string;
  station_id: string;
  status: string; // 'pending' | 'in_progress' | 'ready' | 'bumped'
  items: KDSTicketItem[];
  created_at: string;
  bumped_at?: string;
}

// ─── Stations ───────────────────────────────────────────────────────────────

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

// ─── Tickets ────────────────────────────────────────────────────────────────

export function useKDSTickets(stationId?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['kds-tickets', tenantID, stationId],
    queryFn: () =>
      apiClient.get<{ data: KDSTicket[] }>(`${basePath(tenantID)}/tickets`, {
        station_id: stationId,
      }),
    enabled: !!tenantID,
    staleTime: 5_000,
    refetchInterval: 10_000, // Auto-refresh for live KDS
  });
}

// ─── Bump (mark ready) ─────────────────────────────────────────────────────

export function useBumpTicket() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) =>
      apiClient.put(`${basePath(tenantID)}/tickets/${ticketId}/bump`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kds-tickets'] }),
  });
}
