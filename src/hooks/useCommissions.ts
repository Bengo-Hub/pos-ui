'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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
  order_line_id?: string;
  service_sku: string;
  /** Sale amount the commission was calculated on. */
  sale_amount: number;
  /** Percentage at time of sale (e.g. 10 means 10%). */
  commission_rate: number;
  /** Commission earned. */
  commission_amount: number;
  status: 'pending' | 'paid' | 'voided';
  notes?: string;
  created_at: string;
}

// ─── Commission Rules ─────────────────────────────────────────────────────────

export interface CommissionRule {
  id: string;
  name: string;
  rate: number;
  applies_to: 'all' | 'category' | 'item';
  category?: string;
  catalog_item_id?: string;
  is_active: boolean;
  created_at: string;
}

export interface CommissionRuleInput {
  name: string;
  rate: number;
  applies_to: 'all' | 'category' | 'item';
  category?: string;
  catalog_item_id?: string;
}

export function useCommissionRules() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['commission-rules', tenantID],
    queryFn: () =>
      apiClient.get<{ data: CommissionRule[] }>(`${basePath(tenantID)}/rules`),
    enabled: !!tenantID,
    staleTime: 60_000,
    select: (res) => res.data ?? [],
  });
}

export function useCreateCommissionRule() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CommissionRuleInput) =>
      apiClient.post<CommissionRule>(`${basePath(tenantID)}/rules`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission-rules', tenantID] }),
  });
}

export function useUpdateCommissionRule(id: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CommissionRuleInput>) =>
      apiClient.put<CommissionRule>(`${basePath(tenantID)}/rules/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission-rules', tenantID] }),
  });
}

export function useDeleteCommissionRule() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<{ ok: boolean }>(`${basePath(tenantID)}/rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission-rules', tenantID] }),
  });
}

// ─── Commission Records ────────────────────────────────────────────────────────

export function useCommissions(filters?: { staff_member_id?: string; order_id?: string }) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['commissions', tenantID, filters],
    queryFn: () =>
      apiClient.get<{ data: CommissionRecord[] }>(basePath(tenantID), {
        staff_member_id: filters?.staff_member_id,
        order_id: filters?.order_id,
      }),
    enabled: !!tenantID,
    staleTime: 30_000,
    select: (res) => res.data ?? [],
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
