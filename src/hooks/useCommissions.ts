'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

function basePath(tenantID: string) {
  return `/api/v1/${tenantID}/pos/commissions`;
}

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

export function useCommissions(filters?: { staff_member_id?: string; order_id?: string }) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['commissions', tenantID, filters],
    queryFn: () =>
      apiClient.get<CommissionRecord[]>(basePath(tenantID), {
        staff_member_id: filters?.staff_member_id,
        order_id: filters?.order_id,
      }),
    enabled: !!tenantID,
    staleTime: 30_000,
  });
}

export function useCommission(id: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['commissions', tenantID, id],
    queryFn: () => apiClient.get<CommissionRecord>(`${basePath(tenantID)}/${id}`),
    enabled: !!tenantID && !!id,
  });
}
