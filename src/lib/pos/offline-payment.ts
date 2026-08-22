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

export interface QueueOfflinePaymentArgs {
  orderId: string;
  tenderId: string;
  method: string;
  amount: number;
  currency: string;
  tenantSlug: string;
  externalRef?: string;
}

export async function queueOfflinePayment({
  orderId, tenderId, method, amount, currency, tenantSlug, externalRef,
}: QueueOfflinePaymentArgs): Promise<void> {
  const localOrder = await getOfflineOrderByLocalId(orderId);
  await savePendingPayment({
    server_order_id: localOrder ? undefined : orderId,
    local_order_id: localOrder ? orderId : undefined,
    tender_id: tenderId,
    tender_method: method,
    amount,
    currency,
    external_ref: externalRef,
    tenant_slug: tenantSlug,
    created_at: new Date().toISOString(),
    synced: false,
  });
}
