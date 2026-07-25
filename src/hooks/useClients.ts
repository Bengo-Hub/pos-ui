'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsApi } from '@/lib/api/clients';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';

// NOTE: the Clients DIRECTORY lives in treasury-ui (/customers — the central customers page
// with balances, credit terms and account filters); the POS nav links out to it. These hooks
// only serve in-terminal flows: the checkout customer picker and the credit-sale hint.

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

export function useCreateLoyaltyAccount() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { customer_name: string; customer_phone: string; customer_email?: string; program_id?: string }) =>
      apiClient.post<{ id?: string }>(`/api/v1/${tenantID}/pos/loyalty/accounts`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-clients', tenantID] }),
  });
}

/** Customer AR credit info (treasury via pos-api proxy): balance due + credit limit/period +
 *  the full account-balance picture (debit/credit/opening). Credit terms are EDITED centrally
 *  on the treasury Customers page, not in POS. */
export interface ClientCredit {
  crm_contact_id?: string;
  customer_name?: string;
  balance_due: string;
  credit_limit?: string;
  credit_period_days?: number;
  currency: string;
  /** AR balance carried in at onboarding (undefined = never set). */
  opening_balance?: string;
  /** Money the BUSINESS owes the CUSTOMER (store credit — e.g. from a return), drawable via the
   *  "Apply Credit" tender. Always >= 0; independent of balance_due. */
  store_credit_balance?: string;
  /** Money the CUSTOMER owes the BUSINESS — max(0, balance_due). */
  outstanding_debit?: string;
  overdue_amount?: string;
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

/**
 * Identifier-based variant of useClientCredit — no POS LoyaltyAccount required. Most attached
 * customers have no loyalty account yet (the common CRM-merge search result), but treasury's AR
 * balance is keyed by crm_contact_id/phone regardless of loyalty membership, so this is what shows
 * a real balance for them. crmContactId wins when both are given. Query key shares the
 * 'pos-client-credit' prefix so a single invalidateQueries({queryKey:['pos-client-credit', tid]})
 * (e.g. after a return completes) covers both this and the account-id form.
 */
export function useClientCreditByIdentifier(crmContactId?: string, phone?: string) {
  const tenantID = useTenantID();
  const key = crmContactId || phone || '';
  return useQuery({
    queryKey: ['pos-client-credit', tenantID, 'by-identifier', key],
    queryFn: () =>
      apiClient.get<ClientCredit>(`/api/v1/${tenantID}/pos/clients/credit`, {
        ...(crmContactId ? { crm_contact_id: crmContactId } : {}),
        ...(!crmContactId && phone ? { phone } : {}),
      }),
    enabled: !!tenantID && !!key,
    staleTime: 30_000,
  });
}
