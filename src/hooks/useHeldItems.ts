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

/**
 * Claim a held item INTO an active order — the backend appends a real line to that order and
 * bumps its totals (no KDS ticket: the item is already made). claimedOrderId is required.
 */
export function useClaimHeldItem() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, claimedOrderId, reason }: { id: string; claimedOrderId: string; reason?: string }) =>
      apiClient.post(`${base(tenantID)}/held-items/${id}/claim`, { claimed_order_id: claimedOrderId, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['held-items'] });
      // The target order gained a line + new totals — refresh order lists and any open bill views.
      qc.invalidateQueries({ queryKey: ['pos-orders'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

/**
 * Void an unclaimed held item (the end-of-shift last resort). Manager-gated on the backend:
 * non-manager callers must pass an approvalToken from a step-up for action "held_item.void" —
 * a 403 {code:"approval_required"} response means open the manager PIN dialog.
 */
export function useVoidHeldItem() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason, approvalToken }: { id: string; reason?: string; approvalToken?: string }) =>
      apiClient.post(`${base(tenantID)}/held-items/${id}/void`, { reason, approval_token: approvalToken }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['held-items'] }),
  });
}
