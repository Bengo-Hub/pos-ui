'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { purchaseOrdersApi, type CreatePurchaseOrderInput } from '@/lib/api/purchase-orders';

export type { PurchaseOrder, PurchaseOrderLine } from '@/lib/api/purchase-orders';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

export function usePurchaseOrders(status?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['purchase-orders', tenantID, status],
    queryFn: () => purchaseOrdersApi.list(tenantID, status),
    enabled: !!tenantID,
    staleTime: 2 * 60_000,
  });
}

export function usePurchaseOrder(id?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['purchase-order', tenantID, id],
    queryFn: () => purchaseOrdersApi.get(tenantID, id!),
    enabled: !!tenantID && !!id,
    staleTime: 60_000,
  });
}

export function useCreatePurchaseOrder() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseOrderInput) =>
      purchaseOrdersApi.create(tenantID, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders', tenantID] }),
  });
}
