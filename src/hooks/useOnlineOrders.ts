'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { onlineOrdersApi } from '@/lib/api/online-orders';
import { useAuthStore } from '@/store/auth';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

/** Query key factory keeps the delivery/rider keys consistent across components. */
export const onlineOrderKeys = {
  pickup: (tenantID: string) => ['pickup-orders', tenantID] as const,
  delivery: (tenantID: string) => ['delivery-orders', tenantID] as const,
  riders: (tenantID: string) => ['online-order-riders', tenantID] as const,
};

/**
 * useDeliveryOrders — active online DELIVERY orders (metadata.source "online_delivery").
 * Mirrors the pickup query's polling cadence so both sections refresh together.
 */
export function useDeliveryOrders() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: onlineOrderKeys.delivery(tenantID),
    queryFn: () => onlineOrdersApi.listDelivery(tenantID),
    enabled: !!tenantID,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

/**
 * useAvailableRiders — active fleet riders for the assign dialog. Lazy: pass
 * `enabled` (e.g. only when the dialog is open) to avoid hitting logistics on load.
 * Riders change slowly relative to orders, so a longer staleTime is used.
 */
export function useAvailableRiders(enabled = true) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: onlineOrderKeys.riders(tenantID),
    queryFn: () => onlineOrdersApi.listAvailableRiders(tenantID),
    enabled: !!tenantID && enabled,
    staleTime: 60_000,
  });
}

/**
 * useAssignRider — assign a rider to a delivery order. Invalidates the delivery
 * (and pickup, since they share the underlying orders list) queries on success.
 */
export function useAssignRider() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderID, riderId }: { orderID: string; riderId: string }) =>
      onlineOrdersApi.assignRider(tenantID, orderID, riderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: onlineOrderKeys.delivery(tenantID) });
      qc.invalidateQueries({ queryKey: onlineOrderKeys.pickup(tenantID) });
    },
  });
}
