'use client';

import { CustomerDetailsModal } from '@/components/pos/customers/customer-details-modal';
import { DownloadReceiptButton } from '@/components/pos/download-receipt-button';
import { PrintReceiptButton } from '@/components/pos/print-receipt-button';
import { InitiateReturnModal } from '@/components/pos/returns/initiate-return-modal';
import { EditSaleInfoModal } from '@/components/pos/sales/edit-sale-info-modal';
import { ReceiptShareButtons } from '@/components/pos/sales/receipt-share-actions';
import { RecordPaymentModal } from '@/components/pos/sales/record-payment-modal';
import { prettyMethod } from '@/components/pos/sales/sales-shared';
import { P, usePermissions } from '@/hooks/usePermissions';
import { useOrder } from '@/hooks/usePOS';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Loader2, Pencil, RotateCcw, Undo2, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

const money = (n: number | undefined | null) =>
  `KSh ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_LABEL: Record<string, string> = {
  completed: 'Final', pending_payment: 'Ready for Payment', open: 'Open',
  draft: 'Draft', cancelled: 'Cancelled', voided: 'Voided', refunded: 'Refunded',
};

const RETURN_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

interface OrderReturn {
  id: string;
  return_number: string;
  return_type: string;
  status: string;
  reason?: string;
  refund_amount: number;
  refund_channel?: string | null;
  created_at: string;
}

/**
 * SellDetailsModal — the GoDigital-style "Sell Details" popup opened when a row in the
 * All-Sales / POS-only list is clicked. Fetches the full order (lines + payments) and lays
 * it out as an invoice: products table, payment-info table, totals sidebar, linked
 * sell-returns, an activity timeline, and a footer action bar (Packing Slip / Print
 * Invoice / Sell Return / Close) reusing the same print + returns pipelines as the
 * per-row Actions dropdown.
 */
export function SellDetailsModal({ orderId, orgSlug, onClose }: { orderId: string; orgSlug: string; onClose: () => void }) {
  const { data: order, isLoading } = useOrder(orderId);
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const { can, canAny } = usePermissions();
  const canReturn = canAny([P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE]);
  // Edit Sale Info (served-by + customer correction) — same admin/manager tier the backend
  // route enforces (pos.orders.manage); blocked only on voided/cancelled/refunded orders,
  // mirroring orders.Service.UpdateSaleInfo's status guard.
  const canEditSaleInfo = can(P.ORDERS_MANAGE);
  const [editSaleInfoOpen, setEditSaleInfoOpen] = useState(false);

  // Linked sell-returns for this sale (rejected included here — the section is an audit view).
  const { data: returnsData } = useQuery({
    queryKey: ['pos-order-returns', tenantID, orderId],
    queryFn: () =>
      apiClient.get<{ data: OrderReturn[] }>(
        `/api/v1/${tenantID}/pos/returns?order_id=${orderId}`,
        undefined,
        { suppressErrorToast: true },
      ),
    enabled: !!tenantID && !!orderId,
    staleTime: 60_000,
  });
  const returns: OrderReturn[] = (returnsData as any)?.data ?? [];
  const activeReturns = returns.filter((r) => r.status !== 'rejected');
  const returnedTotal = activeReturns.reduce((s, r) => s + (r.refund_amount ?? 0), 0);

  const lines = (order as any)?.edges?.lines ?? [];
  const payments = (order as any)?.edges?.payments ?? [];
  const meta = (order as any)?.metadata ?? {};
  // amount_due/total_paid come from the server's canonical orders.ComputeSettlement (the SAME
  // number the All-Sales list and the Customer modal read) — this endpoint used to return the
  // raw order and force the modal to re-derive "outstanding" itself 3 different ways (Total
  // paid summed ALL completed payments incl. on_account; Total remaining subtracted that from
  // total; the footer button instead excluded on_account payments AND ignored returns), which is
  // exactly why the footer button and the totals row could disagree for the same sale. One
  // server-computed number now, used everywhere in this modal.
  const totalPaid = (order as any)?.total_paid ?? 0;
  const amountDue = (order as any)?.amount_due ?? 0;
  const isFinal = (order as any)?.status === 'completed';
  const [recordPayOpen, setRecordPayOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const canTakePayment = canAny([P.PAYMENTS_ADD, P.PAYMENTS_MANAGE]);

  // Activity timeline assembled from what the order already carries (no extra endpoint):
  // creation, settled payments, and each linked return stage.
  const activities: { date: string; action: string; note: string }[] = order
    ? [
        {
          date: (order as any).created_at,
          action: 'Added',
          note: `Status: ${STATUS_LABEL[(order as any).status] ?? (order as any).status} — Total ${money((order as any).total_amount)}`,
        },
        ...payments
          .filter((p: any) => p.status === 'completed')
          .map((p: any) => ({
            date: p.occurred_at ?? p.created_at,
            action: 'Payment',
            note: `${money(p.amount)} via ${prettyMethod(p.payment_data?.method || p.payment_data?.mode || '') || 'tender'}`,
          })),
        ...returns.map((r) => ({
          date: r.created_at,
          action: `Return ${r.status}`,
          note: `${r.return_number} — ${r.return_type.replace('_', ' ')} ${money(r.refund_amount)}${r.reason ? ` (${r.reason})` : ''}`,
        })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-5xl my-6 flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card rounded-t-2xl z-10">
          <h2 className="font-bold text-lg flex items-center gap-2">
            Sell Details {order ? <span className="text-muted-foreground font-normal">( Invoice No. : {(order as any).order_number} )</span> : ''}
            {activeReturns.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-600 px-2 py-0.5 text-xs font-semibold">
                <Undo2 className="h-3 w-3" /> Returned {money(returnedTotal)}
              </span>
            )}
          </h2>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        {isLoading || !order ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Header meta */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p><b>Invoice No.:</b> #{(order as any).order_number}</p>
                <p><b>Status:</b> {STATUS_LABEL[(order as any).status] ?? (order as any).status}</p>
                <p><b>Payment Status:</b> {(() => {
                  const ps: string = (order as any).payment_status || (amountDue <= 0.01 ? 'paid' : totalPaid > 0 ? 'partial' : 'due');
                  return ps.charAt(0).toUpperCase() + ps.slice(1);
                })()}</p>
              </div>
              <div>
                <p><b>Customer:</b>{' '}
                  {(order as any).customer_phone ? (
                    <button type="button" onClick={() => setCustomerOpen(true)}
                      className="text-primary hover:underline" title="Open customer profile">
                      {(order as any).customer_name || 'Walk-In Customer'}
                    </button>
                  ) : ((order as any).customer_name || 'Walk-In Customer')}
                </p>
                {(order as any).customer_phone && <p><b>Phone:</b> {(order as any).customer_phone}</p>}
                {meta.shipping_address && <p><b>Address:</b> {meta.shipping_address}</p>}
              </div>
              <div className="sm:text-right">
                <p><b>Date:</b> {new Date((order as any).created_at).toLocaleString('en-KE')}</p>
                <p><b>Served by:</b> {(order as any).served_by_name || (order as any).cashier_name || '—'}</p>
                {meta.shipping_status && <p><b>Shipping:</b> {meta.shipping_status}</p>}
              </div>
            </div>

            {/* Products */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary text-primary-foreground text-left text-xs">
                    <th className="px-3 py-2 rounded-l-md">#</th><th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2 text-right">Unit Price</th>
                    <th className="px-3 py-2 text-right">Discount</th><th className="px-3 py-2 text-right">Tax</th>
                    <th className="px-3 py-2 text-right rounded-r-md">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l: any, i: number) => {
                    const sub = l.total_price ?? (l.unit_price ?? 0) * (l.quantity ?? 0);
                    // Per-line happy-hour discount is stamped into line metadata by pos-api
                    // (discount_amount + a happy_hour {label} for the deal name).
                    const hh = l.metadata?.happy_hour;
                    const lineDiscount = l.discount_amount ?? l.metadata?.discount_amount ?? hh?.discount_amount ?? 0;
                    return (
                      <tr key={l.id ?? i}>
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          {l.name}{l.sku ? <span className="text-muted-foreground"> {l.sku}</span> : ''}
                          {hh?.label && (
                            <span className="ml-2 text-[10px] font-semibold text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5 whitespace-nowrap">
                              {hh.label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(l.quantity ?? 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(l.unit_price)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(lineDiscount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(l.tax_amount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(sub)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Payment info */}
              <div>
                <h3 className="font-semibold mb-2">Payment info</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-primary text-primary-foreground text-left text-xs">
                        <th className="px-3 py-2">#</th><th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Reference No</th><th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2">Mode</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {payments.length === 0 ? (
                        <tr><td colSpan={5} className="px-3 py-3 text-center text-muted-foreground text-xs">No payments recorded.</td></tr>
                      ) : payments.map((p: any, i: number) => (
                        <tr key={p.id ?? i}>
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2">{p.occurred_at ? new Date(p.occurred_at).toLocaleDateString('en-KE') : '—'}</td>
                          <td className="px-3 py-2">{p.external_reference || (p.id ? String(p.id).slice(0, 10) : '—')}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(p.amount)}</td>
                          <td className="px-3 py-2">{prettyMethod(p.payment_data?.method || p.payment_data?.mode || '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-1.5 text-sm">
                <TotalLine label="Total" value={money((order as any).subtotal)} />
                <TotalLine label="Discount (-)" value={money((order as any).discount_total)} />
                <TotalLine label="Order Tax (+)" value={money((order as any).tax_total)} />
                <TotalLine label="Shipping (+)" value={money(meta.shipping_amount)} />
                <TotalLine label="Total Payable" value={money((order as any).total_amount)} bold />
                <TotalLine label="Total paid" value={money(totalPaid)} />
                {returnedTotal > 0.001 && <TotalLine label="Sell Return (-)" value={money(returnedTotal)} tone="destructive" />}
                <TotalLine label="Total remaining" value={money(amountDue)} bold tone={amountDue > 0.01 ? 'destructive' : undefined} />
              </div>
            </div>

            {/* Linked sell-returns */}
            {returns.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Undo2 className="h-4 w-4 text-red-600" /> Sell Returns
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-accent/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2">Return No.</th><th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Type</th><th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Refund</th><th className="px-3 py-2">Channel</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {returns.map((r) => (
                        <tr key={r.id}>
                          <td className="px-3 py-2">
                            <Link href={`/${orgSlug}/returns/${r.id}`} className="text-primary font-mono text-xs hover:underline">
                              {r.return_number}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-xs">{new Date(r.created_at).toLocaleString('en-KE')}</td>
                          <td className="px-3 py-2 capitalize text-xs">{r.return_type.replace('_', ' ')}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${RETURN_STATUS_BADGE[r.status] ?? 'bg-muted text-muted-foreground'}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(r.refund_amount)}</td>
                          <td className="px-3 py-2 capitalize text-xs">{prettyMethod(r.refund_channel ?? '') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(order as any).sell_note || meta.staff_note ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><b>Sell note:</b><p className="text-muted-foreground">{(order as any).sell_note || '—'}</p></div>
                <div><b>Staff note:</b><p className="text-muted-foreground">{meta.staff_note || '—'}</p></div>
              </div>
            ) : null}

            {/* Activities */}
            {activities.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Activities</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-accent/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2">Date</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {activities.map((a, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-xs whitespace-nowrap">{a.date ? new Date(a.date).toLocaleString('en-KE') : '—'}</td>
                          <td className="px-3 py-2 text-xs font-medium">{a.action}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{a.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer action bar — mirrors the per-row Actions dropdown's core actions. */}
        {order && (
          <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-border sticky bottom-0 bg-card rounded-b-2xl">
            {canTakePayment && amountDue > 0.01 && (
              <button
                onClick={() => setRecordPayOpen(true)}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-bold hover:opacity-90">
                <Banknote className="h-4 w-4" /> Record Payment ({money(amountDue)})
              </button>
            )}
            <PrintReceiptButton orderId={orderId} label="Packing Slip" variant="outline"
              className="h-9 gap-2 text-sm" />
            <PrintReceiptButton orderId={orderId} label="Print Invoice" variant="outline"
              className="h-9 gap-2 text-sm" />
            <ReceiptShareButtons order={order as any} compact buttonClassName="h-9 gap-2 text-sm" />
            {/* Direct file download — bypasses the print-agent queue entirely, a reliable "just
                get me the file" option when the print pipeline itself is what's broken. */}
            <DownloadReceiptButton orderId={orderId} orderNumber={(order as any).order_number} variant="outline"
              className="h-9 gap-2 text-sm" />
            {isFinal && canReturn && (
              <button
                onClick={() => setReturnModalOpen(true)}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50">
                <RotateCcw className="h-4 w-4" /> Sell Return
              </button>
            )}
            {canEditSaleInfo && !['voided', 'cancelled', 'refunded'].includes((order as any).status) && (
              <button
                onClick={() => setEditSaleInfoOpen(true)}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border text-sm font-medium hover:bg-accent">
                <Pencil className="h-4 w-4" /> Edit Sale Info
              </button>
            )}
            <button onClick={onClose}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90">
              Close
            </button>
          </div>
        )}
      </div>

      {recordPayOpen && order && (
        <RecordPaymentModal
          order={{
            id: (order as any).id,
            order_number: (order as any).order_number,
            customer_name: (order as any).customer_name,
            total_amount: (order as any).total_amount,
            total_paid: totalPaid,
            amount_due: amountDue,
          }}
          onClose={() => setRecordPayOpen(false)}
        />
      )}
      {customerOpen && order && (order as any).customer_phone && (
        <CustomerDetailsModal
          customerName={(order as any).customer_name}
          customerPhone={(order as any).customer_phone}
          onClose={() => setCustomerOpen(false)}
        />
      )}
      {returnModalOpen && order && (
        <InitiateReturnModal
          initialOrderNumber={(order as any).order_number}
          onClose={() => setReturnModalOpen(false)}
        />
      )}
      {editSaleInfoOpen && order && (
        <EditSaleInfoModal order={order as any} onClose={() => setEditSaleInfoOpen(false)} />
      )}
    </div>
  );
}

function TotalLine({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: 'destructive' }) {
  return (
    <div className={`flex justify-between py-1.5 px-3 rounded-md ${bold ? 'font-bold bg-muted/40' : ''}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${tone === 'destructive' ? 'text-destructive' : ''}`}>{value}</span>
    </div>
  );
}
