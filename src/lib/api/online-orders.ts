import { apiClient } from './client';

export interface PickupOrder {
  id: string;
  order_number: string;
  status: string;
  customer_name?: string;
  customer_phone?: string;
  total_amount: number;
  created_at: string;
  metadata?: Record<string, any>;
}

/**
 * DeliveryOrder is the same POSOrder shape surfaced for online DELIVERY orders
 * (metadata.source === "online_delivery"). It additionally carries the assigned
 * rider id when one has been set (metadata.rider_id) so the UI can reflect state.
 */
export type DeliveryOrder = PickupOrder;

/**
 * Rider is a logistics fleet member returned by the riders proxy. pos-api proxies
 * logistics-api GET /fleet/members?status=active, whose response flattens the user
 * identity fields. `id` is the fleet-member id used as `rider_id` when assigning.
 */
export interface Rider {
  id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  status?: string;
  driver_code?: string;
  average_rating?: number;
  vehicle_type?: string;
}

/** Source tag set by ordering-backend's online-order consumer for delivery orders. */
export const ONLINE_DELIVERY_SOURCE = 'online_delivery';

function onlineBase(tenantID: string) {
  return `/api/v1/${tenantID}/pos/online-orders`;
}

/** Unwrap either a bare array or a { data, total } pagination envelope. */
function unwrapList<T>(res: { data: T[]; total: number } | T[]): T[] {
  return Array.isArray(res) ? res : (res?.data ?? []);
}

export const onlineOrdersApi = {
  listPickup: (tenantID: string, params?: { status?: string }) =>
    apiClient
      .get<{ data: PickupOrder[]; total: number } | PickupOrder[]>(`${onlineBase(tenantID)}/pickup`, params)
      .then((res): PickupOrder[] => unwrapList(res)),

  /**
   * listDelivery surfaces online DELIVERY orders. There is no dedicated delivery
   * list endpoint in pos-api (the pickup endpoint hardcodes the pickup sources), so
   * we read the active orders list and filter for metadata.source === "online_delivery".
   * Active statuses only (exclude completed/cancelled) to mirror the pickup queue.
   */
  listDelivery: (tenantID: string) =>
    apiClient
      .get<{ data: DeliveryOrder[]; total: number } | DeliveryOrder[]>(
        `/api/v1/${tenantID}/pos/orders`,
        { status: 'pending,confirmed,preparing,ready,ready_for_pickup,out_for_delivery,dispatched' },
      )
      .then((res): DeliveryOrder[] =>
        unwrapList(res).filter((o) => o?.metadata?.source === ONLINE_DELIVERY_SOURCE),
      ),

  /**
   * listDeliveryDispatch surfaces POS-NATIVE delivery orders (order_subtype=delivery placed at the
   * terminal) that need a rider. Unlike listDelivery (online orders from ordering-backend), these
   * are served by a dedicated pos-api endpoint and assigned via logistics-api directly.
   */
  listDeliveryDispatch: (tenantID: string) =>
    apiClient
      .get<{ data: DeliveryOrder[]; total: number } | DeliveryOrder[]>(`${onlineBase(tenantID)}/dispatch`)
      .then((res): DeliveryOrder[] => unwrapList(res)),

  /** Collection history: collected + uncollected pickup/takeaway/delivery orders. */
  listHistory: (tenantID: string, outcome?: 'collected' | 'uncollected') =>
    apiClient
      .get<{ data: DeliveryOrder[]; total: number } | DeliveryOrder[]>(`${onlineBase(tenantID)}/history`, outcome ? { outcome } : undefined)
      .then((res): DeliveryOrder[] => unwrapList(res)),

  markReady: (tenantID: string, orderID: string) =>
    apiClient.post(`${onlineBase(tenantID)}/${orderID}/ready`, {}),

  markCollected: (tenantID: string, orderID: string) =>
    apiClient.post(`${onlineBase(tenantID)}/${orderID}/collected`, {}),

  /** List active fleet riders available for assignment (proxied from logistics-api). */
  listAvailableRiders: (tenantID: string) =>
    apiClient
      .get<{ data: Rider[]; total: number } | Rider[]>(`${onlineBase(tenantID)}/riders`)
      .then((res): Rider[] => unwrapList(res)),

  /** Assign a rider to a delivery order (delegated to ordering-backend by pos-api). */
  assignRider: (tenantID: string, orderID: string, riderId: string) =>
    apiClient.post(`${onlineBase(tenantID)}/${orderID}/assign-rider`, { rider_id: riderId }),
};
