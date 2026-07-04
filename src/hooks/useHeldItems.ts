'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface HeldItem {
  id: string;
  outlet_id: string;
  source_order_id: string;
  name: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  reason?: string;
  status: 'held' | 'claimed' | 'voided';
  held_by_user_id: string;
  created_at: string;
}

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}
const base = (tid: string) => `/api/v1/${tid}/pos`;

/** Set aside a line from an order (already-made, wrongly-ordered item) into the held pool. */
export function useSetAsideLine() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, lineId, reason }: { orderId: string; lineId: string; reason?: string }) =>
      apiClient.post(`${base(tenantID)}/orders/${orderId}/lines/${lineId}/set-aside`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['held-items'] });
      qc.invalidateQueries({ queryKey: ['pos-orders'] });
    },
  });
}

/** List the outlet's held (set-aside) items awaiting a claim or void. */
export function useHeldItems(status: 'held' | 'claimed' | 'voided' = 'held', enabled = true) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['held-items', tenantID, status],
    queryFn: () =>
      apiClient
        .get<{ data: HeldItem[]; total: number }>(`${base(tenantID)}/held-items`, { status })
        .then((r) => r.data ?? []),
    enabled: !!tenantID && enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/** Claim a held item for a new customer (optionally into their order). */
export function useClaimHeldItem() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, claimedOrderId }: { id: string; claimedOrderId?: string }) =>
      apiClient.post(`${base(tenantID)}/held-items/${id}/claim`, { claimed_order_id: claimedOrderId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['held-items'] }),
  });
}

/** Void an unclaimed held item (e.g. at shift close). */
export function useVoidHeldItem() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiClient.post(`${base(tenantID)}/held-items/${id}/void`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['held-items'] }),
  });
}
