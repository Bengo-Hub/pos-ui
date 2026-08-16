'use client';

import { apiClient } from '@/lib/api/client';
import { completeLayawayPlan } from '@/lib/api/layaway';
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
  outlet_id?: string;
  /** Set once the plan has been completed/handed over — the POSOrder raised for the goods.
   *  `status === 'completed' && !order_id` means "paid off but not yet handed over". */
  order_id?: string;
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
  /** Branch/outlet the plan belongs to — required by the backend (defaults to the user's outlet). */
  outlet_id: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  /** Loyalty account of the picked/created customer (CRM-synced) — required for customer party. */
  loyalty_account_id?: string;
  total_amount: number;
  deposit_amount: number;
  due_date?: string;
  notes?: string;
  // Party: an existing customer (default) or a staff member funded from salary (premium).
  party_type?: 'customer' | 'staff';
  staff_member_id?: string;
  fund_from_salary?: boolean;
  installment_months?: number;
}

export interface RecordPaymentInput {
  amount: number;
  payment_method: 'cash' | 'mpesa' | 'card';
  reference?: string;
  notes?: string;
  /** ISO 8601 — when the money actually changed hands; omit to default to now (backdating support). */
  paid_at?: string;
}

// ─── Query keys ──────────────────────────────────────────────────────────────

export const layawayKeys = {
  all: (tid: string) => ['layaways', tid] as const,
  list: (tid: string, status?: string, outletId?: string, from?: string, to?: string) => ['layaways', tid, 'list', status, outletId, from, to] as const,
  detail: (tid: string, id: string) => ['layaways', tid, id] as const,
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useLayawayPlans(status?: string, outletId?: string, from?: string, to?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: layawayKeys.list(tenantID, status, outletId, from, to),
    queryFn: () =>
      apiClient.get<{ data: LayawayPlan[]; total: number }>(basePath(tenantID), {
        ...(status ? { status } : {}),
        ...(outletId ? { outlet_id: outletId } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      }),
    enabled: !!tenantID,
    select: (res) => res.data ?? [],
  });
}

export function useLayawayPlan(id: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: layawayKeys.detail(tenantID, id),
    // pos-api's LayawayHandler.Get answers `{plan, payments}` (the payments are a separate
    // query server-side, so they can't ride on the plan row). Flatten it to the plan the whole
    // UI expects, with `payments` folded in. The `?? res` branch keeps any flat payload working.
    queryFn: async () => {
      const res = await apiClient.get<LayawayPlan | { plan: LayawayPlan; payments?: LayawayPayment[] }>(
        `${basePath(tenantID)}/${id}`,
      );
      const wrapped = res as { plan?: LayawayPlan; payments?: LayawayPayment[] };
      if (wrapped?.plan) return { ...wrapped.plan, payments: wrapped.payments ?? wrapped.plan.payments ?? [] };
      return res as LayawayPlan;
    },
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

/** pos-api's RecordPayment answers `{payment, plan}` — the created instalment row plus the
 *  re-balanced plan. `payment.id` is what addresses that instalment's printable receipt. */
export interface RecordLayawayPaymentResponse {
  payment: LayawayPayment;
  plan: LayawayPlan;
}

export function useRecordLayawayPayment(planId: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordPaymentInput) =>
      apiClient.post<RecordLayawayPaymentResponse>(`${basePath(tenantID)}/${planId}/payments`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: layawayKeys.detail(tenantID, planId) });
      qc.invalidateQueries({ queryKey: layawayKeys.all(tenantID) });
    },
  });
}

/** Finalise a fully-paid plan — raises the POSOrder for the handed-over goods (GL/stock/eTIMS
 *  all fire off that order). Server requires remaining_amount <= 0 (409 otherwise) and is
 *  idempotent, so a re-tap returns the same order ids instead of a second sale. */
export function useCompleteLayaway(planId: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => completeLayawayPlan(tenantID, planId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: layawayKeys.detail(tenantID, planId) });
      qc.invalidateQueries({ queryKey: layawayKeys.all(tenantID) });
      // The completion raises a real sale — the sales lists must pick it up.
      qc.invalidateQueries({ queryKey: ['pos-orders'] });
    },
  });
}

export function useCancelLayaway() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    // Cancelling also refunds any deposit/installments already collected (see pos-api
    // LayawayHandler.Cancel); warning is set when that refund call itself failed — the plan is
    // still cancelled, but the refund needs manual follow-up.
    mutationFn: (planId: string) =>
      apiClient.post<{ plan: LayawayPlan; warning?: string }>(`${basePath(tenantID)}/${planId}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: layawayKeys.all(tenantID) }),
  });
}
