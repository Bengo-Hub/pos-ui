import { apiClient } from './client';

/**
 * Client for the pos-api bill-splits subsystem
 * (handlers/billsplits.go → /{tenantID}/pos/orders/{orderID}/splits).
 *
 * IMPORTANT: these routes parse {tenantID} as a UUID (parseTenantUUID), so callers must pass the
 * tenant UUID (user.tenant_id), NOT the slug.
 *
 * Splits are a reporting/record layer: actual order settlement is driven by POSPayment rows
 * (pos-api completes the order once completed payments cover the total). All calls here are
 * therefore best-effort — callers should not block payment on them.
 */

export interface BillSplit {
  id: string;
  tenant_id: string;
  order_id: string;
  split_label: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'voided';
  payment_method?: string;
  external_ref?: string;
  payment_id?: string | null;
}

export interface CreateSplitInput {
  label: string;
  amount: number;
}

const splitsBase = (tenantID: string, orderID: string) =>
  `/api/v1/${tenantID}/pos/orders/${orderID}/splits`;

/** Replace the order's pending splits with this set. Returns the created splits (with their IDs). */
export function createSplits(tenantID: string, orderID: string, splits: CreateSplitInput[]) {
  return apiClient.post<{ data: BillSplit[]; total: number }>(splitsBase(tenantID, orderID), { splits });
}

/** Mark a single split paid, recording the tender method (and optional external ref / M-Pesa code). */
export function settleSplit(
  tenantID: string,
  orderID: string,
  splitID: string,
  paymentMethod: string,
  externalRef?: string,
) {
  return apiClient.post<BillSplit>(`${splitsBase(tenantID, orderID)}/${splitID}/settle`, {
    payment_method: paymentMethod,
    external_ref: externalRef,
  });
}

/** List an order's splits with aggregate totals (data envelope + total/paid/balance). */
export function listSplits(tenantID: string, orderID: string) {
  return apiClient.get<{ data: unknown; total_amount: number; paid_amount: number; balance: number }>(
    splitsBase(tenantID, orderID),
  );
}
