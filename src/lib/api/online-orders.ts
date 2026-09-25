import { apiClient } from './client';

/** One line of an order in the pickup / delivery queue (POSOrderLine as returned by pos-api). */
export interface QueueOrderLine {
  id: string;
  name: string;
  quantity: number;
  sku?: string;
  metadata?: Record<string, any>;
}

/**
 * QueueOrder is a POS order shown in the online-orders queue: online pickup / delivery orders
 * ingested from the online store, plus POS-native takeaway and delivery orders. Online orders
 * carry metadata.online_order_id and the payment state the counter needs (prepaid, amount_due,
 * payment_channel "mpesa_manual" + mpesa_code for a customer-entered M-Pesa payment).
 */
export interface PickupOrder {
  id: string;
  order_number: string;
  status: string;
  order_subtype?: string;
  customer_name?: string;
  customer_phone?: string;
  total_amount: number;
  created_at: string;
  metadata?: Record<string, any>;
  edges?: { lines?: QueueOrderLine[] };
}

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

export interface CollectPayload {
  /** Confirms the amount due was taken for a pay-on-collection / pay-on-delivery order. */
  cash_collected?: boolean;
  payment_method?: 'cash' | 'mpesa' | 'card';
  /** M-Pesa code when the customer paid the counter or delivery staff by M-Pesa. */
  reference?: string;
}

function onlineBase(tenantID: string) {
  return `/api/v1/${tenantID}/pos/online-orders`;
}

/** Unwrap either a bare array or a { data, total } pagination envelope. */
function unwrapList<T>(res: { data: T[]; total: number } | T[]): T[] {
  return Array.isArray(res) ? res : (res?.data ?? []);
}

export const onlineOrdersApi = {
  /** Pickup queue: online click-and-collect + POS takeaway orders for the active outlet, with lines. */
  listPickup: (tenantID: string, params?: { status?: string }) =>
    apiClient
      .get<{ data: PickupOrder[]; total: number } | PickupOrder[]>(`${onlineBase(tenantID)}/pickup`, { limit: 100, ...params })
      .then((res): PickupOrder[] => unwrapList(res)),

  /** Delivery queue: online AND POS-native delivery orders (order_subtype=delivery), with lines. */
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

  markCollected: (tenantID: string, orderID: string, body: CollectPayload = {}) =>
    apiClient.post(`${onlineBase(tenantID)}/${orderID}/collected`, body),

  /** Reject an online order the outlet cannot fulfil (ordering refunds and notifies the customer). */
  reject: (tenantID: string, orderID: string, reason: string) =>
    apiClient.post(`${onlineBase(tenantID)}/${orderID}/reject`, { reason }),

  /** Confirm a customer's M-Pesa payment to the business Till/Paybill (manual M-Pesa). */
  verifyPayment: (tenantID: string, orderID: string, reference?: string) =>
    apiClient.post(`${onlineBase(tenantID)}/${orderID}/verify-payment`, { reference }),

  /** List active fleet riders available for assignment (proxied from logistics-api). */
  listAvailableRiders: (tenantID: string) =>
    apiClient
      .get<{ data: Rider[]; total: number } | Rider[]>(`${onlineBase(tenantID)}/riders`)
      .then((res): Rider[] => unwrapList(res)),

  /** Assign a rider to a delivery order (delegated to ordering-backend by pos-api). */
  assignRider: (tenantID: string, orderID: string, riderId: string) =>
    apiClient.post(`${onlineBase(tenantID)}/${orderID}/assign-rider`, { rider_id: riderId }),
};

// ─── Order helpers shared by the queue cards ─────────────────────────────────

export const isOnlineOrder = (o: PickupOrder) => !!o.metadata?.online_order_id;
export const isDeliveryOrder = (o: PickupOrder) =>
  o.order_subtype === 'delivery' || o.metadata?.fulfillment_type === 'delivery';
export const isManualMpesa = (o: PickupOrder) => o.metadata?.payment_channel === 'mpesa_manual';

/** Paid already: prepaid online, verified manual M-Pesa, or a POS order settled at the till. */
export function isOrderPaid(o: PickupOrder): boolean {
  if (isOnlineOrder(o)) return o.metadata?.prepaid === true || o.metadata?.payment_status === 'paid';
  return o.status === 'completed' || o.status === 'paid' || o.metadata?.payment_status === 'paid';
}

/** The kitchen / packing is done and the order waits at the counter. */
export function isOrderReady(o: PickupOrder): boolean {
  return ['pending_payment', 'ready_for_pickup', 'ready', 'completed', 'paid'].includes(o.status);
}

/** Amount to collect on handover for an online order that is not paid yet. */
export function amountDue(o: PickupOrder): number {
  const due = Number(o.metadata?.amount_due ?? 0);
  return due > 0 ? due : Number(o.metadata?.online_grand_total ?? o.total_amount ?? 0);
}
