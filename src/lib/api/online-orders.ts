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

function onlineBase(tenantID: string) {
  return `/api/v1/${tenantID}/pos/online-orders`;
}

export const onlineOrdersApi = {
  listPickup: (tenantID: string) =>
    apiClient.get<PickupOrder[]>(`${onlineBase(tenantID)}/pickup`),

  markReady: (tenantID: string, orderID: string) =>
    apiClient.post(`${onlineBase(tenantID)}/${orderID}/ready`, {}),

  markCollected: (tenantID: string, orderID: string) =>
    apiClient.post(`${onlineBase(tenantID)}/${orderID}/collected`, {}),
};
