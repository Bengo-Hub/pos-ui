'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

function base(tenantID: string) {
  return `/api/v1/${tenantID}/pos/loyalty`;
}

export interface LoyaltyProgram {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  earn_rate: number;
  redeem_rate: number;
  min_redeem_points: number;
  is_active: boolean;
  created_at: string;
}

export interface LoyaltyAccount {
  id: string;
  tenant_id: string;
  customer_phone: string;
  customer_name: string;
  points_balance: number;
  lifetime_points: number;
  program_id?: string;
  created_at: string;
}

export interface LoyaltyTransaction {
  id: string;
  account_id: string;
  type_field: 'earn' | 'redeem' | 'adjust' | 'expire';
  points: number;
  balance_after: number;
  notes?: string;
  created_at: string;
}

export function useLoyaltyPrograms() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['loyalty-programs', tenantID],
    queryFn: () => apiClient.get<LoyaltyProgram[]>(`${base(tenantID)}/programs`),
    enabled: !!tenantID,
  });
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export function useLoyaltyAccounts(phone?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['loyalty-accounts', tenantID, phone],
    queryFn: () =>
      apiClient
        .get<PaginatedResponse<LoyaltyAccount>>(
          `${base(tenantID)}/accounts`,
          phone ? { phone } : undefined,
        )
        .then((res) => (Array.isArray(res) ? res : res.data ?? [])),
    enabled: !!tenantID,
    staleTime: 15_000,
  });
}

export function useLoyaltyAccount(id: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['loyalty-account', tenantID, id],
    queryFn: () =>
      apiClient.get<{ account: LoyaltyAccount; transactions: LoyaltyTransaction[] }>(
        `${base(tenantID)}/accounts/${id}`,
      ),
    enabled: !!tenantID && !!id,
  });
}

export function useCreateLoyaltyAccount() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { customer_phone: string; customer_name: string; program_id?: string }) =>
      apiClient.post<LoyaltyAccount>(`${base(tenantID)}/accounts`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loyalty-accounts', tenantID] }),
  });
}

export function useEarnPoints(accountId: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { points: number; order_id?: string; notes?: string }) =>
      apiClient.post(`${base(tenantID)}/accounts/${accountId}/earn`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loyalty-account', tenantID, accountId] }),
  });
}

export function useRedeemPoints(accountId: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { points: number; order_id?: string; notes?: string }) =>
      apiClient.post(`${base(tenantID)}/accounts/${accountId}/redeem`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loyalty-account', tenantID, accountId] }),
  });
}
