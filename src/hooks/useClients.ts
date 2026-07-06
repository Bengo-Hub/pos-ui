'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsApi } from '@/lib/api/clients';
export type { ClientOrder } from '@/lib/api/clients';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

export function useClientSearch(phone?: string, name?: string, email?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-clients', tenantID, phone, name, email],
    queryFn: () => clientsApi.searchAccounts(tenantID, phone || undefined, name || undefined, email || undefined),
    enabled: !!tenantID && !!(phone || name || email),
    staleTime: 30_000,
  });
}

export function useClient(accountID: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-client', tenantID, accountID],
    queryFn: () => clientsApi.getAccount(tenantID, accountID),
    enabled: !!tenantID && !!accountID,
    staleTime: 60_000,
  });
}

export function useCreateLoyaltyAccount() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { customer_name: string; customer_phone: string; customer_email?: string; program_id?: string }) =>
      apiClient.post<{ id?: string }>(`/api/v1/${tenantID}/pos/loyalty/accounts`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-clients', tenantID] }),
  });
}

/** Customer AR credit info (treasury via pos-api proxy): balance due + credit limit/period. */
export interface ClientCredit {
  crm_contact_id?: string;
  customer_name?: string;
  balance_due: string;
  credit_limit?: string;
  credit_period_days?: number;
  currency: string;
}

export function useClientCredit(accountID?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-client-credit', tenantID, accountID],
    queryFn: () => apiClient.get<ClientCredit>(`/api/v1/${tenantID}/pos/clients/${accountID}/credit`),
    enabled: !!tenantID && !!accountID,
    staleTime: 30_000,
  });
}

/** Manager sets the customer's credit limit / payment period (pos.orders.manage gated). */
export function useSetClientCredit(accountID: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { credit_limit?: number; credit_period_days?: number }) =>
      apiClient.put<ClientCredit>(`/api/v1/${tenantID}/pos/clients/${accountID}/credit`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-client-credit', tenantID, accountID] }),
  });
}

export function useAddLoyaltyPoints() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountID, points, orderId }: { accountID: string; points: number; orderId?: string }) =>
      apiClient.post(`/api/v1/${tenantID}/pos/loyalty/accounts/${accountID}/earn`, { points, order_id: orderId }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['pos-client', tenantID, vars.accountID] });
      qc.invalidateQueries({ queryKey: ['pos-clients', tenantID] });
    },
  });
}

export function useClientOrders(phone?: string, page = 1) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['client-orders', tenantID, phone, page],
    queryFn: () => clientsApi.getClientOrders(tenantID, phone!, page),
    enabled: !!tenantID && !!phone,
    staleTime: 30_000,
  });
}

export function useRedeemLoyaltyPoints() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountID, points, orderId }: { accountID: string; points: number; orderId?: string }) =>
      apiClient.post(`/api/v1/${tenantID}/pos/loyalty/accounts/${accountID}/redeem`, { points, order_id: orderId }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['pos-client', tenantID, vars.accountID] });
      qc.invalidateQueries({ queryKey: ['pos-clients', tenantID] });
    },
  });
}
