'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { onlineOrdersApi, isOnlineOrder, type CollectPayload, type PickupOrder } from '@/lib/api/online-orders';
import { playKDSTone } from '@/lib/kds-sounds';
import { useAuthStore } from '@/store/auth';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

/** Query key factory keeps the queue keys consistent across components. */
export const onlineOrderKeys = {
  pickup: (tenantID: string) => ['pickup-orders', tenantID] as const,
  dispatch: (tenantID: string) => ['delivery-dispatch', tenantID] as const,
  riders: (tenantID: string) => ['online-order-riders', tenantID] as const,
};

/** Refresh cadence of the live queue. A new online order also rings (see useNewOnlineOrderAlert). */
const QUEUE_REFRESH_MS = 10_000;

/** usePickupOrders — online click-and-collect + POS takeaway orders for the active outlet. */
export function usePickupOrders() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: onlineOrderKeys.pickup(tenantID),
    queryFn: () => onlineOrdersApi.listPickup(tenantID),
    enabled: !!tenantID,
    staleTime: 5_000,
    refetchInterval: QUEUE_REFRESH_MS,
  });
}

/** useDeliveryDispatch — online and POS-native delivery orders for the active outlet. */
export function useDeliveryDispatch() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: onlineOrderKeys.dispatch(tenantID),
    queryFn: () => onlineOrdersApi.listDeliveryDispatch(tenantID),
    enabled: !!tenantID,
    staleTime: 5_000,
    refetchInterval: QUEUE_REFRESH_MS,
  });
}

/** usePickupHistory — collection records (collected + uncollected). Lazy: pass enabled. */
export function usePickupHistory(outcome?: 'collected' | 'uncollected', enabled = true) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: [...onlineOrderKeys.dispatch(tenantID), 'history', outcome ?? 'all'],
    queryFn: () => onlineOrdersApi.listHistory(tenantID, outcome),
    enabled: !!tenantID && enabled,
    staleTime: 30_000,
  });
}

/**
 * useAvailableRiders — active fleet riders for the assign dialog. Lazy: pass
 * `enabled` (e.g. only when the dialog is open) to avoid hitting logistics on load.
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

function useInvalidateQueues() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: onlineOrderKeys.pickup(tenantID) });
    qc.invalidateQueries({ queryKey: onlineOrderKeys.dispatch(tenantID) });
    qc.invalidateQueries({ queryKey: ['pos-orders'] });
  };
}

/** useAssignRider — assign a rider to a delivery order. */
export function useAssignRider() {
  const tenantID = useTenantID();
  const invalidate = useInvalidateQueues();
  return useMutation({
    mutationFn: ({ orderID, riderId }: { orderID: string; riderId: string }) =>
      onlineOrdersApi.assignRider(tenantID, orderID, riderId),
    onSuccess: invalidate,
  });
}

/** useOnlineOrderActions — the counter's actions on a queue order. */
export function useOnlineOrderActions() {
  const tenantID = useTenantID();
  const invalidate = useInvalidateQueues();
  return {
    markReady: useMutation({
      mutationFn: (orderID: string) => onlineOrdersApi.markReady(tenantID, orderID),
      onSuccess: invalidate,
    }),
    markCollected: useMutation({
      mutationFn: ({ orderID, body }: { orderID: string; body?: CollectPayload }) =>
        onlineOrdersApi.markCollected(tenantID, orderID, body),
      onSuccess: invalidate,
    }),
    reject: useMutation({
      mutationFn: ({ orderID, reason }: { orderID: string; reason: string }) =>
        onlineOrdersApi.reject(tenantID, orderID, reason),
      onSuccess: invalidate,
    }),
    verifyPayment: useMutation({
      mutationFn: ({ orderID, reference }: { orderID: string; reference?: string }) =>
        onlineOrdersApi.verifyPayment(tenantID, orderID, reference),
      onSuccess: invalidate,
    }),
  };
}

/**
 * useNewOnlineOrderAlert rings the KDS tone and shows a toast when a new ONLINE order lands in the
 * queue, the way a delivery-platform tablet does, so a busy counter notices it without watching the
 * screen. Orders present on first load never ring.
 */
export function useNewOnlineOrderAlert(orders: PickupOrder[], ready: boolean) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!ready) return;
    const online = orders.filter(isOnlineOrder);
    if (seen.current === null) {
      seen.current = new Set(online.map((o) => o.id));
      return;
    }
    const fresh = online.filter((o) => !seen.current!.has(o.id));
    fresh.forEach((o) => seen.current!.add(o.id));
    if (fresh.length === 0) return;
    playKDSTone();
    const first = fresh[0];
    toast.info(
      fresh.length === 1
        ? `New online order ${first.order_number}${first.customer_name ? ` from ${first.customer_name}` : ''}`
        : `${fresh.length} new online orders`,
      { duration: 8000 },
    );
  }, [orders, ready]);
}
