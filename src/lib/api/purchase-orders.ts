import { apiClient } from './client';

export interface PurchaseOrderLine {
  id: string;
  sku?: string;
  name: string;
  quantity: number;
  unit_cost?: number;
  total_cost?: number;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_name?: string;
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
  total_amount?: number;
  currency?: string;
  expected_date?: string;
  created_at: string;
  line_item_count?: number;
  lines?: PurchaseOrderLine[];
}

export interface CreatePurchaseOrderInput {
  supplier_id?: string;
  supplier_name?: string;
  expected_date?: string;
  notes?: string;
  lines: {
    sku: string;
    name: string;
    quantity: number;
    unit_cost?: number;
  }[];
}

function base(tenantID: string) {
  return `/api/v1/${tenantID}/pos/purchase-orders`;
}

export const purchaseOrdersApi = {
  list: (tenantID: string, status?: string) =>
    apiClient.get<{ data: PurchaseOrder[] }>(
      base(tenantID) + (status ? `?status=${status}` : '')
    ),

  get: (tenantID: string, id: string) =>
    apiClient.get<PurchaseOrder>(`${base(tenantID)}/${id}`),

  create: (tenantID: string, body: CreatePurchaseOrderInput) =>
    apiClient.post<PurchaseOrder>(base(tenantID), body),
};
