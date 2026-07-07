'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useEffectiveOnline, isEffectivelyOnline } from '@/lib/connectivity';
import { useAuthStore } from '@/store/auth';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import {
  getPendingSyncOrders,
  markOrderSynced,
  markOrderSyncFailed,
  getPendingSyncPayments,
  markPaymentSynced,
  markPaymentSyncFailed,
  getPendingSyncVoids,
  markVoidSynced,
  markVoidSyncFailed,
  getPendingSyncReturns,
  markReturnSynced,
  markReturnSyncFailed,
  getPendingSyncDrawerSessions,
  markDrawerSessionSynced,
  markDrawerSessionSyncFailed,
  getPendingSyncDrawerCloses,
  markDrawerCloseSynced,
  markDrawerCloseSyncFailed,
  getPendingETIMSSubmissions,
  markETIMSSubmissionSynced,
  markETIMSSubmissionFailed,
  resolveServerOrderId,
  resolveServerDrawerId,
} from '@/lib/db/pos-db';

/**
 * Background sync worker — drains all IndexedDB queues when connectivity is restored.
 *
 * Drain order (dependency-respecting): a payment/void/return of a locally-created order
 * needs that order's server id first, so orders sync before anything that references them.
 *  1. drawer sessions (open)  → create on server
 *  2. orders                  → create on server (idempotent via Idempotency-Key/client_reference)
 *  3. payments                → record (local_order_id remapped to the now-synced server id)
 *  4. voids                   → apply
 *  5. returns                 → apply
 *  6. drawer closes           → close on server
 *  7. eTIMS queue             → forward to treasury
 *
 * Every replay carries an Idempotency-Key so a retried request can never double-apply.
 * Failures back off (retryable) or dead-letter (terminal 4xx) via the queue helpers.
 *
 * Mount once via <OfflineSyncWorker /> in the org shell. Exposes syncNow() so the service
 * worker Background Sync handler and a manual "retry" button can trigger a drain too.
 */
export function useSyncOfflineOrders() {
  const isOnline = useEffectiveOnline();
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const syncingRef = useRef(false);
  const qc = useQueryClient();

  const runSync = useCallback(async () => {
    const { isBackgroundSyncPaused } = await import('@/lib/sync/sync-control');
    if (!tenantID || syncingRef.current || !isEffectivelyOnline() || isBackgroundSyncPaused()) return;
    syncingRef.current = true;
    try {
      await syncDrawerSessions(tenantID);
      await syncOrders(tenantID);
      await syncPayments(tenantID);
      await syncVoids(tenantID);
      await syncReturns(tenantID);
      await syncDrawerCloses(tenantID);
      await syncETIMSQueue(tenantID);

      qc.invalidateQueries({ queryKey: ['pos-orders'] });
      qc.invalidateQueries({ queryKey: ['pos-drawer-current'] });
      qc.invalidateQueries({ queryKey: ['pos-sync-status'] });
    } finally {
      syncingRef.current = false;
    }
  }, [tenantID, qc]);

  useEffect(() => {
    if (!isOnline || !tenantID) return;
    // 1.5 s delay to let the network settle after a reconnect transient.
    const initial = setTimeout(runSync, 1500);
    // Periodic re-drain so items that hit a transient failure (e.g. the network still settling
    // right after reconnect) and backed off are retried — without this a single transient error
    // on reconnect strands the queue until the next online event or manual trigger.
    const interval = setInterval(runSync, 10_000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [isOnline, tenantID, runSync]);

  // Let the service worker (Background Sync) ask the page to drain when it regains focus.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'POS_SYNC') void runSync();
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [runSync]);

  // Manual trigger (e.g. the "Retry" button on the dead-letter panel) → drain now.
  useEffect(() => {
    const onTrigger = () => void runSync();
    window.addEventListener('pos:sync-now', onTrigger);
    return () => window.removeEventListener('pos:sync-now', onTrigger);
  }, [runSync]);

  return { syncNow: runSync };
}

/** Ask the mounted sync worker to drain the queues now. */
export function triggerSyncNow() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('pos:sync-now'));
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

/** Idempotency-Key header so a replayed request is deduped server-side. */
function idem(key: string) {
  return { headers: { 'Idempotency-Key': key } };
}

/** A 4xx (except 408/429) is a terminal validation error — replaying won't help; dead-letter it. */
function isTerminal(err: any): boolean {
  const s = err?.response?.status;
  return typeof s === 'number' && s >= 400 && s < 500 && s !== 408 && s !== 429;
}

function errMsg(err: any): string {
  return err?.response?.data?.error ?? err?.message ?? 'sync failed';
}

/** Sync-monitor activity feed — every replayed (or failed) push is logged, best-effort. */
function logPush(entity: string, detail: string, err?: any) {
  void import('@/lib/db/kv-cache').then(({ appendSyncLog }) =>
    appendSyncLog({
      direction: 'push',
      entity,
      detail,
      status: err ? 'error' : 'ok',
      error: err ? errMsg(err) : undefined,
    }),
  );
}

// ── Drawer session sync ────────────────────────────────────────────────────────

async function syncDrawerSessions(tenantID: string) {
  for (const session of await getPendingSyncDrawerSessions()) {
    try {
      const res: any = await apiClient.post(
        `/api/v1/${tenantID}/pos/drawers/open`,
        { outletId: session.outlet_id, startingCash: session.starting_cash },
        idem(session.local_id),
      );
      await markDrawerSessionSynced(session.local_id, res?.id ?? '');
      logPush('drawer_open', `Float ${session.starting_cash.toFixed(2)}`);
    } catch (err: any) {
      await markDrawerSessionSyncFailed(session.local_id, errMsg(err), isTerminal(err));
      logPush('drawer_open', `Float ${session.starting_cash.toFixed(2)}`, err);
    }
  }
}

// ── Order sync ─────────────────────────────────────────────────────────────────

async function syncOrders(tenantID: string) {
  for (const order of await getPendingSyncOrders()) {
    try {
      const res: any = await apiClient.post(
        `/api/v1/${tenantID}/pos/orders`,
        {
          outlet_id: order.outlet_id,
          currency: order.currency,
          lines: order.lines,
          client_reference: order.local_id,
          offline_created_at: order.created_at,
        },
        idem(order.local_id),
      );
      const serverOrderId: string = res?.id ?? res?.order_id ?? '';
      await markOrderSynced(order.local_id, serverOrderId);
      logPush('order', `Sale ${order.currency} ${order.total_amount.toFixed(2)}`);

      // Record a payment bundled with the order at creation time (if any).
      if (serverOrderId && order.pending_payment) {
        try {
          await apiClient.post(
            `/api/v1/${tenantID}/pos/orders/${serverOrderId}/payments/intent`,
            {
              tenderMethod: order.pending_payment.tender_method,
              tenderId: order.pending_payment.tender_id,
              amount: order.pending_payment.amount,
              currency: order.currency,
              externalRef: order.pending_payment.external_ref,
            },
            idem(`pay-${order.local_id}`),
          );
        } catch {
          // Non-fatal — a separately-queued payment (via syncPayments) will cover it.
        }
      }
    } catch (err: any) {
      await markOrderSyncFailed(order.local_id, errMsg(err), isTerminal(err));
      logPush('order', `Sale ${order.currency} ${order.total_amount.toFixed(2)}`, err);
    }
  }
}

// ── Payment sync ───────────────────────────────────────────────────────────────

async function syncPayments(tenantID: string) {
  for (const payment of await getPendingSyncPayments()) {
    // Resolve the server order id: either it already exists, or the order was created
    // offline and we look up the id it got when it synced. If still unresolved, skip —
    // the order hasn't synced yet (or failed); we retry on the next pass.
    let orderId = payment.server_order_id;
    if (!orderId && payment.local_order_id) {
      orderId = await resolveServerOrderId(payment.local_order_id);
    }
    if (!orderId) continue;

    try {
      await apiClient.post(
        `/api/v1/${tenantID}/pos/orders/${orderId}/payments/intent`,
        {
          tenderMethod: payment.tender_method,
          tenderId: payment.tender_id,
          amount: payment.amount,
          currency: payment.currency,
          externalRef: payment.external_ref,
        },
        idem(`pay-${payment.local_order_id ?? orderId}-${payment.tender_method}-${payment.external_ref ?? payment.amount}`),
      );
      await markPaymentSynced(payment.id!);
      logPush('payment', `${payment.tender_method} ${payment.amount.toFixed(2)}`);
    } catch (err: any) {
      await markPaymentSyncFailed(payment.id!, errMsg(err), isTerminal(err));
      logPush('payment', `${payment.tender_method} ${payment.amount.toFixed(2)}`, err);
    }
  }
}

// ── Void sync ──────────────────────────────────────────────────────────────────

async function syncVoids(tenantID: string) {
  for (const v of await getPendingSyncVoids()) {
    let orderId = v.server_order_id;
    if (!orderId && v.local_order_id) orderId = await resolveServerOrderId(v.local_order_id);
    if (!orderId) continue;
    try {
      if (v.line_id) {
        await apiClient.post(
          `/api/v1/${tenantID}/pos/orders/${orderId}/lines/${v.line_id}/void`,
          { reason: v.reason, approval_token: v.approval_token },
          idem(v.local_id),
        );
      } else {
        await apiClient.patch(
          `/api/v1/${tenantID}/pos/orders/${orderId}/void`,
          { reason: v.reason, approval_token: v.approval_token },
          idem(v.local_id),
        );
      }
      await markVoidSynced(v.id!);
      logPush('void', v.line_id ? 'Line void' : 'Order void');
    } catch (err: any) {
      await markVoidSyncFailed(v.id!, errMsg(err), isTerminal(err));
      logPush('void', v.line_id ? 'Line void' : 'Order void', err);
    }
  }
}

// ── Return sync ────────────────────────────────────────────────────────────────

async function syncReturns(tenantID: string) {
  for (const r of await getPendingSyncReturns()) {
    let orderId = r.server_order_id;
    if (!orderId && r.local_order_id) orderId = await resolveServerOrderId(r.local_order_id);
    if (!orderId) continue;
    try {
      await apiClient.post(
        `/api/v1/${tenantID}/pos/orders/${orderId}/returns`,
        {
          outlet_id: r.outlet_id,
          return_type: r.return_type,
          reason: r.reason,
          reason_code: r.reason_code,
          refund_channel: r.refund_channel,
          lines: r.lines,
        },
        idem(r.local_id),
      );
      await markReturnSynced(r.id!);
      logPush('return', `Return ${r.refund_amount.toFixed(2)}`);
    } catch (err: any) {
      await markReturnSyncFailed(r.id!, errMsg(err), isTerminal(err));
      logPush('return', `Return ${r.refund_amount.toFixed(2)}`, err);
    }
  }
}

// ── eTIMS queue sync ───────────────────────────────────────────────────────────

async function syncETIMSQueue(tenantID: string) {
  for (const sub of await getPendingETIMSSubmissions()) {
    try {
      await apiClient.post(
        `/api/v1/${tenantID}/treasury/etims/queue`,
        { order_id: sub.order_id, invoice_data: sub.invoice_data },
      );
      await markETIMSSubmissionSynced(sub.id!);
      logPush('etims', `Order ${sub.order_id}`);
    } catch (err: any) {
      await markETIMSSubmissionFailed(sub.id!, errMsg(err));
      logPush('etims', `Order ${sub.order_id}`, err);
    }
  }
}

// ── Drawer close sync ──────────────────────────────────────────────────────────

async function syncDrawerCloses(tenantID: string) {
  for (const close of await getPendingSyncDrawerCloses()) {
    // A close against a drawer opened offline waits until the session syncs and the local
    // drawer id resolves to a server id.
    let drawerId = close.server_drawer_id;
    if (!drawerId && close.local_drawer_id) {
      // The drawer was opened offline; use the server id it got when its session synced.
      drawerId = await resolveServerDrawerId(close.local_drawer_id);
    }
    if (!drawerId) continue; // session not synced yet — retry next pass

    try {
      await apiClient.post(
        `/api/v1/${tenantID}/pos/drawers/${drawerId}/close`,
        { endingCash: close.ending_cash },
        idem(`close-${drawerId}`),
      );
      await markDrawerCloseSynced(close.id!);
      logPush('drawer_close', `Ending ${close.ending_cash.toFixed(2)}`);
    } catch (err: any) {
      await markDrawerCloseSyncFailed(close.id!, errMsg(err), isTerminal(err));
      logPush('drawer_close', `Ending ${close.ending_cash.toFixed(2)}`, err);
    }
  }
}

/**
 * Lightweight reactive snapshot of how many items are still queued — drives the header
 * pending-sync badge. Polls IndexedDB on an interval and on query invalidation.
 */
export function usePendingSyncCount() {
  const [counts, setCounts] = useState({ pending: 0, deadLetter: 0 });
  useEffect(() => {
    let active = true;
    const tick = async () => {
      const { getSyncStatusCounts } = await import('@/lib/db/pos-db');
      const c = await getSyncStatusCounts();
      if (active) setCounts(c);
    };
    void tick();
    const interval = setInterval(tick, 5000);
    return () => { active = false; clearInterval(interval); };
  }, []);
  return counts;
}
