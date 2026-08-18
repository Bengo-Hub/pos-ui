'use client';

import { apiClient } from '@/lib/api/client';
import { classifySearchQuery, type CustomerSearchParams } from '@/lib/api/clients';
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
  tier_thresholds?: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyAccount {
  /** Empty string for CRM-only rows merged into search results (source === 'crm'). */
  id: string;
  tenant_id: string;
  customer_id?: string;
  customer_phone: string;
  customer_name: string;
  customer_email?: string;
  crm_contact_id?: string;
  points_balance: number;
  lifetime_points: number;
  program_id?: string;
  created_at: string;
  updated_at: string;
  /** 'crm' — a CRM contact with no loyalty account yet (search merge); undefined — real loyalty account. */
  source?: string;
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

// The pos-api returns ent entities directly, and ent tags every field `json:",omitempty"`.
// That means ZERO-valued numbers (a brand-new account's points_balance, a 0 redeem_rate, etc.)
// are OMITTED from the JSON entirely — so the field arrives as `undefined` on the client and any
// `n.toLocaleString()` / arithmetic blows up. Coerce the numeric fields back to real numbers at the
// data boundary so the declared types hold and components never see `undefined` where a number is typed.
function normalizeAccount(a: LoyaltyAccount): LoyaltyAccount {
  return {
    ...a,
    points_balance: Number(a.points_balance ?? 0),
    lifetime_points: Number(a.lifetime_points ?? 0),
  };
}

function normalizeProgram(p: LoyaltyProgram): LoyaltyProgram {
  return {
    ...p,
    earn_rate: Number(p.earn_rate ?? 0),
    redeem_rate: Number(p.redeem_rate ?? 0),
    min_redeem_points: Number(p.min_redeem_points ?? 0),
  };
}

// `enabled` lets callers skip the fetch when the outlet's use-case can never satisfy pos-api's
// RequireUseCase("retail","services","pharmacy") gate on /loyalty/* (hospitality/quick_service
// outlets are deliberately excluded — loyalty is a retail/services concept there) — calling it
// anyway is a guaranteed, silently-swallowed 403 on every terminal load for those outlets.
export function useLoyaltyPrograms(enabled = true) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useQuery({
    // IndexedDB-first (raw response cached; normalization stays in `select` so background
    // refreshes pushed by the sync job hydrate identically).
    queryKey: ['loyalty-programs', tenantID],
    queryFn: async () => {
      const { cacheFirst } = await import('@/lib/offline/cache-first');
      const { getDataset, datasetCacheOpts } = await import('@/lib/offline/datasets');
      return cacheFirst(
        datasetCacheOpts(getDataset('loyalty-programs'), tenantID, undefined, qc),
      ) as Promise<PaginatedResponse<LoyaltyProgram> | LoyaltyProgram[]>;
    },
    enabled: !!tenantID && enabled,
    networkMode: 'always',
    select: (res) =>
      (Array.isArray(res) ? res : res.data ?? []).map(normalizeProgram),
  });
}

export function useCreateLoyaltyProgram() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<LoyaltyProgram, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) =>
      apiClient.post<LoyaltyProgram>(`${base(tenantID)}/programs`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loyalty-programs', tenantID] }),
  });
}

export function useUpdateLoyaltyProgram(programId: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Omit<LoyaltyProgram, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>) =>
      apiClient.put<LoyaltyProgram>(`${base(tenantID)}/programs/${programId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loyalty-programs', tenantID] }),
  });
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * useLoyaltyAccounts lists/searches loyalty accounts. Pass a raw string to search the way the
 * customer picker does (classified into name / phone / email via classifySearchQuery), or a
 * params object for explicit control.
 */
export function useLoyaltyAccounts(search?: string | CustomerSearchParams) {
  const tenantID = useTenantID();
  const params: CustomerSearchParams | undefined =
    typeof search === 'string' ? classifySearchQuery(search) : search;
  const query =
    params && (params.phone || params.name || params.email)
      ? { ...(params.phone ? { phone: params.phone } : {}), ...(params.name ? { name: params.name } : {}), ...(params.email ? { email: params.email } : {}) }
      : undefined;
  return useQuery({
    queryKey: ['loyalty-accounts', tenantID, query?.phone, query?.name, query?.email],
    queryFn: () =>
      apiClient
        .get<PaginatedResponse<LoyaltyAccount>>(
          `${base(tenantID)}/accounts`,
          query,
        )
        .then((res) => (Array.isArray(res) ? res : res.data ?? []))
        .then((list) => list.map(normalizeAccount)),
    enabled: !!tenantID,
    staleTime: 15_000,
  });
}

export function useLoyaltyAccount(id: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['loyalty-account', tenantID, id],
    queryFn: () =>
      apiClient
        .get<{ account: LoyaltyAccount; transactions: LoyaltyTransaction[] }>(
          `${base(tenantID)}/accounts/${id}`,
        )
        .then((res) => ({ ...res, account: normalizeAccount(res.account) })),
    enabled: !!tenantID && !!id,
  });
}

export function useCreateLoyaltyAccount() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { customer_phone: string; customer_name: string; program_id?: string }) =>
      apiClient
        .post<LoyaltyAccount>(`${base(tenantID)}/accounts`, data)
        .then(normalizeAccount),
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

/**
 * "Pay with points" — redeems points AS a settlement tender against a real order (posts a
 * completed POSPayment on the tenant's Loyalty Points tender for points × redeem_rate), unlike
 * `useRedeemPoints` above which only adjusts the account balance. Used by the checkout/settlement
 * "Redeem Points" tender (InlinePaymentBar / POSPaymentModal / Split Payment), not the pre-cart
 * discount redemption in LoyaltyPanel.
 */
export function useRedeemToOrder(accountId: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { points: number; order_id: string; notes?: string }) =>
      apiClient.post(`${base(tenantID)}/accounts/${accountId}/redeem-to-order`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loyalty-account', tenantID, accountId] }),
  });
}

export interface Referral {
  id: string;
  referrer_account_id: string;
  referred_phone: string;
  code: string;
  status: 'pending' | 'earned' | 'expired' | 'cancelled';
  bonus_points: number;
  created_at: string;
  earned_at?: string;
}

export function useReferrals(accountId: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['loyalty-referrals', tenantID, accountId],
    queryFn: () =>
      apiClient
        .get<Referral[] | PaginatedResponse<Referral>>(`${base(tenantID)}/accounts/${accountId}/referrals`)
        .then((res) => (Array.isArray(res) ? res : res.data ?? [])),
    enabled: !!tenantID && !!accountId,
  });
}

export function useCreateReferral(accountId: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { referred_phone: string; bonus_points?: number }) =>
      apiClient.post<Referral>(`${base(tenantID)}/accounts/${accountId}/referrals`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loyalty-referrals', tenantID, accountId] }),
  });
}
