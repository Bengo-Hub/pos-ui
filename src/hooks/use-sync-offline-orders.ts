'use client';

import { useEffect, useRef } from 'react';
import { useOnline } from '@/hooks/use-online';
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
  getPendingSyncDrawerSessions,
  markDrawerSessionSynced,
  getPendingSyncDrawerCloses,
  markDrawerCloseSynced,
  getPendingETIMSSubmissions,
  markETIMSSubmissionSynced,
  markETIMSSubmissionFailed,
} from '@/lib/db/pos-db';

/**
 * Background sync worker — drains all IndexedDB queues when connectivity is restored.
 *
 * Sync order:
 *  1. Offline drawer sessions (open) → create on server
 *  2. Offline orders → create on server; then record bundled cash payment if present
 *  3. Offline payments against server-existing orders → record on server
 *  4. Offline drawer closes → close on server
 *
 * Mount once via <OfflineSyncWorker /> in [orgSlug]/layout.tsx.
 */
export function useSyncOfflineOrders() {
  const isOnline = useOnline();
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const syncingRef = useRef(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (!isOnline || !tenantID || syncingRef.current) return;

    async function sync() {
      syncingRef.current = true;
      try {
        await syncDrawerSessions(tenantID);
        await syncOrders(tenantID);
        await syncPayments(tenantID);
        await syncDrawerCloses(tenantID);
        await syncETIMSQueue(tenantID);

        // Refresh UI after sync
        qc.invalidateQueries({ queryKey: ['pos-orders'] });
        qc.invalidateQueries({ queryKey: ['pos-drawer-current'] });
      } finally {
        syncingRef.current = false;
      }
    }

    // 1.5 s delay to let network settle
    const timer = setTimeout(sync, 1500);
    return () => clearTimeout(timer);
  }, [isOnline, tenantID, qc]);
}

// ── Drawer session sync ────────────────────────────────────────────────────────

async function syncDrawerSessions(tenantID: string) {
  const sessions = await getPendingSyncDrawerSessions();
  for (const session of sessions) {
    try {
      const res: any = await apiClient.post(
        `/api/v1/${tenantID}/pos/drawers/open`,
        {
          outletId: session.outlet_id,
          startingCash: session.starting_cash,
        }
      );
      await markDrawerSessionSynced(session.local_id, res?.id ?? '');
    } catch {
      // Leave for next sync attempt
    }
  }
}

// ── Order sync ─────────────────────────────────────────────────────────────────

async function syncOrders(tenantID: string) {
  const orders = await getPendingSyncOrders();
  for (const order of orders) {
    try {
      const res: any = await apiClient.post(
        `/api/v1/${tenantID}/pos/orders`,
        {
          outlet_id: order.outlet_id,
          currency: order.currency,
          lines: order.lines,
        }
      );
      const serverOrderId: string = res?.id ?? res?.order_id ?? '';
      await markOrderSynced(order.local_id, serverOrderId);

      // If a cash payment was bundled with the offline order, record it now
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
            }
          );
        } catch {
          // Payment sync failed — it will be picked up by syncPayments via local_order_id
        }
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'sync failed';
      await markOrderSyncFailed(order.local_id, msg);
    }
  }
}

// ── Payment sync ───────────────────────────────────────────────────────────────

async function syncPayments(tenantID: string) {
  const payments = await getPendingSyncPayments();
  for (const payment of payments) {
    const orderId = payment.server_order_id;
    if (!orderId) continue; // bundled payments handled in syncOrders

    try {
      await apiClient.post(
        `/api/v1/${tenantID}/pos/orders/${orderId}/payments/intent`,
        {
          tenderMethod: payment.tender_method,
          tenderId: payment.tender_id,
          amount: payment.amount,
          currency: payment.currency,
          externalRef: payment.external_ref,
        }
      );
      await markPaymentSynced(payment.id!);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'sync failed';
      await markPaymentSyncFailed(payment.id!, msg);
    }
  }
}

// ── eTIMS queue sync ───────────────────────────────────────────────────────────

async function syncETIMSQueue(tenantID: string) {
  const submissions = await getPendingETIMSSubmissions();
  for (const sub of submissions) {
    try {
      // Queue with treasury-api which owns eTIMS submission to KRA
      await apiClient.post(
        `/api/v1/${tenantID}/treasury/etims/queue`,
        { order_id: sub.order_id, invoice_data: sub.invoice_data }
      );
      await markETIMSSubmissionSynced(sub.id!);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'sync failed';
      await markETIMSSubmissionFailed(sub.id!, msg);
    }
  }
}

// ── Drawer close sync ──────────────────────────────────────────────────────────

async function syncDrawerCloses(tenantID: string) {
  const closes = await getPendingSyncDrawerCloses();
  for (const close of closes) {
    const drawerId = close.server_drawer_id;
    if (!drawerId) continue; // locally-opened drawers handled when session is synced

    try {
      await apiClient.post(
        `/api/v1/${tenantID}/pos/drawers/${drawerId}/close`,
        { endingCash: close.ending_cash }
      );
      await markDrawerCloseSynced(close.id!);
    } catch {
      // Leave for next sync
    }
  }
}
