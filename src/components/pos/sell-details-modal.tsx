'use client';

import { X, Loader2 } from 'lucide-react';
import { useOrder } from '@/hooks/usePOS';
import { prettyMethod } from '@/components/pos/sales/sales-shared';

const money = (n: number | undefined | null) =>
  `KSh ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_LABEL: Record<string, string> = {
  completed: 'Final', pending_payment: 'Ready for Payment', open: 'Open',
  draft: 'Draft', cancelled: 'Cancelled', voided: 'Voided', refunded: 'Refunded',
};

/**
 * SellDetailsModal — the GoDigital-style "Sell Details" popup opened when a row in the
 * All-Sales / POS-only list is clicked. Fetches the full order (lines + payments) and lays
 * it out as an invoice: products table, payment-info table, and a totals sidebar.
 */
export function SellDetailsModal({ orderId, orgSlug, onClose }: { orderId: string; orgSlug: string; onClose: () => void }) {
  const { data: order, isLoading } = useOrder(orderId);

  const lines = (order as any)?.edges?.lines ?? [];
  const payments = (order as any)?.edges?.payments ?? [];
  const meta = (order as any)?.metadata ?? {};
  const totalPaid = payments.filter((p: any) => p.status === 'completed').reduce((s: number, p: any) => s + (p.amount ?? 0), 0);
  const remaining = Math.max(0, ((order as any)?.total_amount ?? 0) - totalPaid);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-5xl my-6 flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card rounded-t-2xl">
          <h2 className="font-bold text-lg">
            Sell Details {order ? <span className="text-muted-foreground font-normal">( Invoice No. : {(order as any).order_number} )</span> : ''}
          </h2>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent"><X className="h-4 w-4" /></button>
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
                <p><b>Payment Status:</b> {remaining <= 0.01 ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Due'}</p>
              </div>
              <div>
                <p><b>Customer:</b>{' '}
                  {(order as any).customer_phone ? (
                    <a href={`/${orgSlug}/clients?q=${encodeURIComponent((order as any).customer_phone)}`}
                      className="text-primary hover:underline" title="Open customer profile">
                      {(order as any).customer_name || 'Walk-In Customer'}
                    </a>
                  ) : ((order as any).customer_name || 'Walk-In Customer')}
                </p>
                {(order as any).customer_phone && <p><b>Phone:</b> {(order as any).customer_phone}</p>}
                {meta.shipping_address && <p><b>Address:</b> {meta.shipping_address}</p>}
              </div>
              <div className="sm:text-right">
                <p><b>Date:</b> {new Date((order as any).created_at).toLocaleString('en-KE')}</p>
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
                <TotalLine label="Total remaining" value={money(remaining)} bold tone={remaining > 0.01 ? 'destructive' : undefined} />
              </div>
            </div>

            {(order as any).sell_note || meta.staff_note ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><b>Sell note:</b><p className="text-muted-foreground">{(order as any).sell_note || '—'}</p></div>
                <div><b>Staff note:</b><p className="text-muted-foreground">{meta.staff_note || '—'}</p></div>
              </div>
            ) : null}
          </div>
        )}
      </div>
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
