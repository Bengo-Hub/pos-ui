/**
 * Queue a payment for sync when back online — the single implementation shared by every POS
 * settle surface (inline terminal action bar, modal-style settle flow, and anything built on top
 * of either). Previously each surface hand-duplicated this exact `savePendingPayment` payload.
 *
 * Routes via `local_order_id` when `orderId` is itself an offline (not-yet-synced) order, so the
 * sync worker remaps it to the server order id once the order syncs; otherwise it's a server
 * order paid offline.
 */

import { savePendingPayment, getOfflineOrderByLocalId } from '@/lib/db/pos-db';
import { useAuthStore } from '@/store/auth';

export interface QueueOfflinePaymentArgs {
  orderId: string;
  tenderId: string;
  method: string;
  amount: number;
  currency: string;
  tenantSlug: string;
  // The tenant the page names (useTenantId()); an owner's payment on another tenant's page
  // must sync under that tenant. Overridden by the queued order's own tenant when it matches one.
  tenantId: string;
  externalRef?: string;
  // Raw cash physically handed over (cash tender only) — carried through to the sync worker so
  // an offline cash-with-change sale still shows "Tendered"/"Change" on its receipt once synced
  // and printed/reprinted, instead of only ever recording the amount applied.
  amountTendered?: number;
  // How the customer paid, for the "other_manual" tender. Replayed on sync as paymentLabel.
  paymentLabel?: string;
}

export async function queueOfflinePayment({
  orderId, tenderId, method, amount, currency, tenantSlug, tenantId, externalRef, amountTendered, paymentLabel,
}: QueueOfflinePaymentArgs): Promise<void> {
  const localOrder = await getOfflineOrderByLocalId(orderId);
  // A payment for a queued offline order must carry that order's tenant.
  const tenant_id = localOrder?.tenant_id || tenantId;
  // Never queue a payment without a tenant; the sync worker would not know where to post it.
  if (!tenant_id) throw new Error('Organisation not loaded yet');
  await savePendingPayment({
    server_order_id: localOrder ? undefined : orderId,
    local_order_id: localOrder ? orderId : undefined,
    collected_by_user_id: useAuthStore.getState().user?.id,
    tender_id: tenderId,
    tender_method: method,
    amount,
    currency,
    external_ref: externalRef,
    amount_tendered: amountTendered,
    payment_label: paymentLabel,
    tenant_slug: tenantSlug,
    tenant_id,
    created_at: new Date().toISOString(),
    synced: false,
  });
}
