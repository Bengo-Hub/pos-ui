import { apiClient } from '@/lib/api/client';

const base = (tenantSlug: string) => `/api/v1/${tenantSlug}/pos`;

export interface CommissionRecord {
  id: string;
  tenant_id: string;
  staff_member_id: string;
  order_id?: string;
  amount: number;
  rate: number;
  base_amount: number;
  notes?: string;
  created_at: string;
}

export function listCommissions(
  tenantSlug: string,
  params?: { staff_member_id?: string; order_id?: string },
) {
  return apiClient.get<CommissionRecord[]>(`${base(tenantSlug)}/commissions`, params);
}

export function getCommission(tenantSlug: string, id: string) {
  return apiClient.get<CommissionRecord>(`${base(tenantSlug)}/commissions/${id}`);
}
