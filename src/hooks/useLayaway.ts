'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

function basePath(tenantID: string) {
  return `/api/v1/${tenantID}/pos/layaways`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LayawayPayment {
  id: string;
  amount: number;
  payment_method: string;
  reference?: string;
  notes?: string;
  created_at: string;
}

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

export interface CreateLayawayInput {
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

// ─── Query keys ──────────────────────────────────────────────────────────────

export const layawayKeys = {
  all: (tid: string) => ['layaways', tid] as const,
  list: (tid: string, status?: string) => ['layaways', tid, 'list', status] as const,
  detail: (tid: string, id: string) => ['layaways', tid, id] as const,
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useLayawayPlans(status?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: layawayKeys.list(tenantID, status),
    queryFn: () =>
      apiClient.get<{ data: LayawayPlan[]; total: number }>(basePath(tenantID), status ? { status } : undefined),
    enabled: !!tenantID,
    select: (res) => res.data ?? [],
  });
}

export function useLayawayPlan(id: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: layawayKeys.detail(tenantID, id),
    queryFn: () => apiClient.get<LayawayPlan>(`${basePath(tenantID)}/${id}`),
    enabled: !!tenantID && !!id,
  });
}

export function useCreateLayaway() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLayawayInput) =>
      apiClient.post<LayawayPlan>(basePath(tenantID), data),
    onSuccess: () => qc.invalidateQueries({ queryKey: layawayKeys.all(tenantID) }),
  });
}

export function useRecordLayawayPayment(planId: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordPaymentInput) =>
      apiClient.post<LayawayPayment>(`${basePath(tenantID)}/${planId}/payments`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: layawayKeys.detail(tenantID, planId) });
      qc.invalidateQueries({ queryKey: layawayKeys.all(tenantID) });
    },
  });
}

export function useCancelLayaway() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) =>
      apiClient.post<{ ok: boolean }>(`${basePath(tenantID)}/${planId}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: layawayKeys.all(tenantID) }),
  });
}
