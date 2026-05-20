import { apiClient } from '@/lib/api/client';

const base = (tenantSlug: string) => `/api/v1/${tenantSlug}/pos`;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LayawayPlan {
  id: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  total_amount: number;
  deposit_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: 'active' | 'completed' | 'cancelled';
  due_date?: string;
  notes?: string;
  created_at: string;
  payments?: LayawayPayment[];
}

export interface LayawayPayment {
  id: string;
  amount: number;
  payment_method: string;
  reference?: string;
  notes?: string;
  created_at: string;
}

export interface CreateLayawayPlanInput {
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  total_amount: number;
  deposit_amount: number;
  due_date?: string;
  notes?: string;
}

export interface RecordPaymentInput {
  amount: number;
  payment_method: 'cash' | 'mpesa' | 'card';
  reference?: string;
  notes?: string;
}

// ─── API functions ────────────────────────────────────────────────────────────

export function getCatalogItemByBarcode(tenantSlug: string, barcode: string) {
  return apiClient.get<any>(`${base(tenantSlug)}/catalog/barcode/${barcode}`);
}

export function listLayawayPlans(tenantSlug: string, params?: { status?: string }) {
  return apiClient.get<{ data: LayawayPlan[]; total: number }>(
    `${base(tenantSlug)}/layaways`,
    params,
  );
}

export function createLayawayPlan(tenantSlug: string, data: CreateLayawayPlanInput) {
  return apiClient.post<LayawayPlan>(`${base(tenantSlug)}/layaways`, data);
}

export function getLayawayPlan(tenantSlug: string, id: string) {
  return apiClient.get<LayawayPlan>(`${base(tenantSlug)}/layaways/${id}`);
}

export function recordLayawayPayment(tenantSlug: string, id: string, data: RecordPaymentInput) {
  return apiClient.post<LayawayPayment>(`${base(tenantSlug)}/layaways/${id}/payments`, data);
}

export function cancelLayawayPlan(tenantSlug: string, id: string) {
  return apiClient.post<{ ok: boolean }>(`${base(tenantSlug)}/layaways/${id}/cancel`);
}
