'use client';

/**
 * useReceiptAfterSale — the ONE after-sale receipt fetch/open/eTIMS-merge flow.
 *
 * Extracted verbatim from terminal-context's `handlePaymentConfirmed` so every surface that
 * settles money (the order terminal, Add Sale, Tables, Layaway, Returns) opens the SAME
 * `<ReceiptPreview>` with the SAME payload instead of each re-implementing the fetch.
 *
 * Two entry points:
 *  - `showReceiptForOrder(orderId)` — a real POS order: fetches the order receipt endpoint and
 *    then merges the KRA eTIMS block in as it lands (push event first, bounded polls as fallback).
 *  - `showReceiptFromEndpoint(url, orderIdForPrinting?)` — any other receipt-shaped endpoint
 *    (layaway deposit/instalment slips, refund receipts). Those are NOT fiscalised sales, so
 *    there is deliberately no eTIMS merge; everything else is identical.
 *
 * The returned state is wired straight into `<ReceiptPreview receipt open onClose orderId>`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import type { ReceiptData } from '@/components/pos/receipt-preview';
import { ETIMS_FISCALIZED_EVENT, type EtimsFiscalizedPayload } from '@/hooks/use-notification-stream';

export interface UseReceiptAfterSale {
  receiptData: ReceiptData | null;
  receiptOpen: boolean;
  /** Order id the open receipt belongs to (ESC/POS silent print + PDF download need it). */
  receiptOrderId: string;
  /** Fetch the ORDER receipt, open the preview, then merge eTIMS fiscal fields as they land. */
  showReceiptForOrder: (orderId: string) => Promise<void>;
  /** Fetch ANY receipt-shaped endpoint (layaway/return slips) and open the preview — no eTIMS merge. */
  showReceiptFromEndpoint: (url: string, orderIdForPrinting?: string) => Promise<void>;
  closeReceipt: () => void;
  /** Escape hatches for callers that owned this state before (terminal-context). */
  setReceiptData: React.Dispatch<React.SetStateAction<ReceiptData | null>>;
  setReceiptOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useReceiptAfterSale(tenantId: string, fallbackServedBy?: string): UseReceiptAfterSale {
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptOrderId, setReceiptOrderId] = useState('');

  // Every eTIMS merge watcher started by this hook, so unmounting can never leave a dangling
  // window listener behind (the terminal's inline version relied on the poll loop ending).
  const cleanupsRef = useRef<Array<() => void>>([]);
  useEffect(() => () => {
    cleanupsRef.current.forEach((fn) => fn());
    cleanupsRef.current = [];
  }, []);

  // "Served by" — fall back to the logged-in user when the API omits it.
  const withServedBy = useCallback(
    (data: ReceiptData): ReceiptData => ({ ...data, served_by: data.served_by || fallbackServedBy }),
    [fallbackServedBy],
  );

  const showReceiptFromEndpoint = useCallback(async (url: string, orderIdForPrinting?: string) => {
    if (!url) return;
    try {
      const data = await apiClient.get<ReceiptData>(url);
      setReceiptData(withServedBy(data));
      setReceiptOrderId(orderIdForPrinting ?? '');
      setReceiptOpen(true);
    } catch {
      // Receipt fetch failed — not critical, the money movement already succeeded.
    }
  }, [withServedBy]);

  const showReceiptForOrder = useCallback(async (orderId: string) => {
    if (!tenantId || !orderId) return;
    const receiptUrl = `/api/v1/${tenantId}/pos/orders/${orderId}/receipt`;
    try {
      const data = await apiClient.get<ReceiptData>(receiptUrl);
      setReceiptData(withServedBy(data));
      setReceiptOrderId(orderId);
      setReceiptOpen(true);
      // eTIMS fiscalisation lands asynchronously to the on-screen receipt (the sale signs on the
      // post-settlement fan-out). PRIMARY path: pos-api PUSHES `etims_fiscalized` over the
      // notification WebSocket the instant it signs — use-notification-stream re-broadcasts it as
      // the ETIMS_FISCALIZED_EVENT window event, so we refetch ONCE and merge the KRA TIMS block
      // immediately (no 30-50s poll). FALLBACK: a few slow polls in case the socket was momentarily
      // down; then give up (the receipt endpoint still backfills on any later manual view/reprint).
      if (data.etims_cu_inv_no || data.etims_invoice_number) return;

      let done = false;
      const applyFresh = (fresh: ReceiptData) => {
        if (done || !(fresh.etims_cu_inv_no || fresh.etims_invoice_number)) return;
        done = true;
        setReceiptData((prev) =>
          prev && prev.order_number === data.order_number
            ? {
                ...prev,
                etims_invoice_number: fresh.etims_invoice_number,
                etims_qr_code_url: fresh.etims_qr_code_url,
                etims_qr_png: fresh.etims_qr_png,
                etims_scu_id: fresh.etims_scu_id,
                etims_cu_inv_no: fresh.etims_cu_inv_no,
                etims_rcpt_sign: fresh.etims_rcpt_sign,
                etims_kra_pin: fresh.etims_kra_pin,
                // Fiscalisation just landed — the barcode switches from the plain order
                // number to the eTIMS CU invoice number (FiscalBarcodeValue on the server).
                barcode_png: fresh.barcode_png,
                barcode_value: fresh.barcode_value,
              }
            : prev,
        );
      };
      const refetchOnce = async () => {
        try {
          applyFresh(await apiClient.get<ReceiptData>(receiptUrl));
        } catch {
          // transient — the push/fallback will retry
        }
      };
      const onPush = (e: Event) => {
        const detail = (e as CustomEvent<EtimsFiscalizedPayload>).detail;
        if (detail?.order_id === orderId) void refetchOnce();
      };
      window.addEventListener(ETIMS_FISCALIZED_EVENT, onPush as EventListener);
      const stop = () => {
        done = true;
        window.removeEventListener(ETIMS_FISCALIZED_EVENT, onPush as EventListener);
      };
      cleanupsRef.current.push(stop);
      void (async () => {
        for (let attempt = 0; attempt < 3 && !done; attempt++) {
          await new Promise((r) => setTimeout(r, 5000));
          if (!done) await refetchOnce();
        }
        window.removeEventListener(ETIMS_FISCALIZED_EVENT, onPush as EventListener);
        cleanupsRef.current = cleanupsRef.current.filter((fn) => fn !== stop);
      })();
    } catch {
      // Receipt fetch failed — not critical, payment already confirmed
    }
  }, [tenantId, withServedBy]);

  const closeReceipt = useCallback(() => {
    setReceiptOpen(false);
    setReceiptData(null);
  }, []);

  return {
    receiptData,
    receiptOpen,
    receiptOrderId,
    showReceiptForOrder,
    showReceiptFromEndpoint,
    closeReceipt,
    setReceiptData,
    setReceiptOpen,
  };
}
