'use client';

/**
 * GoDigital-style POS toolbar modals — Register Details (Z-report-style shift summary), Recent
 * Transactions, and Sell Return. These open as modals/popovers from the terminal toolbar instead of
 * navigating away from the POS, so the cashier never loses the in-progress sale.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, X, RotateCcw, ClipboardList, Wallet, Pencil, Trash2 } from 'lucide-react';
import { useOrders, useQuotationAction, useQuotations, useVoidOrder } from '@/hooks/usePOS';
import { usePermissions } from '@/hooks/usePermissions';
import { useCurrentShift } from '@/hooks/useShifts';
import { useRegisterDetails } from '@/hooks/useReports';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { formatCurrency } from '@/lib/utils';
import { format, startOfDay } from 'date-fns';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PrintReceiptButton } from '@/components/pos/print-receipt-button';
import { toast } from 'sonner';

function ModalShell({ title, icon: Icon, onClose, children, wide, size }: {
  title: string; icon: React.ElementType; onClose: () => void; children: React.ReactNode; wide?: boolean;
  size?: 'md' | 'lg' | 'xl' | '2xl' | '4xl';
}) {
  const width = size
    ? { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-3xl', '2xl': 'max-w-4xl', '4xl': 'max-w-5xl' }[size]
    : wide ? 'max-w-2xl' : 'max-w-md';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className={`bg-card rounded-2xl border border-border shadow-2xl w-full ${width} max-h-[90vh] flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <h2 className="font-bold text-base">{title}</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// prettyTender turns a tender type/name into a readable label, covering every payment method/option.
function prettyTender(t: { name?: string; type?: string }): string {
  const raw = (t.name || t.type || 'Other').toString();
  const map: Record<string, string> = {
    cash: 'Cash',
    card: 'Paystack',
    card_manual: 'Card / PDQ',
    pdq: 'Card / PDQ',
    card_terminal: 'Card Terminal',
    mpesa: 'M-Pesa Express',
    mpesa_stk: 'M-Pesa Express',
    mpesa_c2b: 'M-Pesa Paybill/Till',
    manual: 'M-Pesa (Code)',
    wallet: 'Wallet',
    on_account: 'On Account (Credit)',
    cod: 'Cash on Delivery',
    bank_transfer: 'Bank Transfer',
    room_charge: 'Room Charge',
  };
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
  return map[key] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Register Details — GoDigital-style detailed register report (payment breakdown, sales/
//    refund/payment/credit totals, products sold, and products sold by brand). Scrollable. ──
export function RegisterDetailsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: shift } = useCurrentShift();
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const fmt = (n: number | undefined) => formatCurrency(n, currency);
  // Report window: from the shift open (or start of today) through now.
  const to = format(new Date(), 'yyyy-MM-dd');
  const from = shift?.opened_at ? format(new Date(shift.opened_at), 'yyyy-MM-dd') : format(startOfDay(new Date()), 'yyyy-MM-dd');
  const { data, isLoading } = useRegisterDetails(from, to, undefined, open);

  if (!open) return null;

  const rangeLabel = shift?.opened_at
    ? `${new Date(shift.opened_at).toLocaleString('en-KE')} — ${new Date().toLocaleString('en-KE')}`
    : `${from} — ${to}`;

  return (
    <ModalShell title={`Register Details`} icon={Wallet} onClose={onClose} size="2xl">
      {isLoading || !data ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-5 text-sm">
          <p className="text-xs text-muted-foreground">{rangeLabel}</p>

          {/* Payment Method breakdown */}
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="py-2 font-bold">Payment Method</th>
                <th className="py-2 font-bold text-right">Sell</th>
                <th className="py-2 font-bold text-right">Expense</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data.payment_methods.length === 0 ? (
                <tr><td colSpan={3} className="py-3 text-center text-xs text-muted-foreground">No payments in this window.</td></tr>
              ) : data.payment_methods.map((m) => (
                <tr key={m.method}>
                  <td className="py-2">{prettyTender({ type: m.method })}</td>
                  <td className="py-2 text-right tabular-nums">{fmt(m.sell_amount)}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{m.expense_amount ? fmt(m.expense_amount) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals block */}
          <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
            <TotalRow label="Total Sales" value={fmt(data.total_sales)} />
            <div className="px-4 py-2.5 bg-red-500/5">
              <div className="flex justify-between font-bold text-red-600">
                <span>Total Refund</span><span className="tabular-nums">{fmt(data.total_refund)}</span>
              </div>
              {data.refund_by_method.map((m) => (
                <div key={m.method} className="flex justify-between text-[11px] text-muted-foreground mt-0.5">
                  <span>{prettyTender({ type: m.method })}</span><span className="tabular-nums">{fmt(m.sell_amount)}</span>
                </div>
              ))}
            </div>
            <TotalRow label="Total Payment" value={fmt(data.total_payment)} tone="green" bold />
            <TotalRow label="Credit Sales" value={fmt(data.credit_sales)} tone="green" bold />
            <TotalRow label="Total Expense" value={fmt(data.total_expense)} tone="red" bold />
          </div>

          {/* Details of products sold */}
          <div>
            <h3 className="font-bold text-base mb-2">Details of products sold</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-2 pr-2">#</th><th className="py-2 pr-2">SKU</th><th className="py-2">Product</th>
                    <th className="py-2 text-right">Quantity</th><th className="py-2 text-right">Total amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.products_sold.length === 0 ? (
                    <tr><td colSpan={5} className="py-3 text-center text-muted-foreground">No products sold.</td></tr>
                  ) : data.products_sold.map((p, i) => (
                    <tr key={p.sku || i}>
                      <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{p.sku || '—'}</td>
                      <td className="py-1.5">{p.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.quantity.toLocaleString()}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmt(p.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Details of products sold by Brand */}
          <div>
            <h3 className="font-bold text-base mb-2">Details of products sold (By Brand)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-2 pr-2">#</th><th className="py-2">Brand</th>
                    <th className="py-2 text-right">Quantity</th><th className="py-2 text-right">Total amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.products_by_brand.length === 0 ? (
                    <tr><td colSpan={4} className="py-3 text-center text-muted-foreground">No brand data.</td></tr>
                  ) : data.products_by_brand.map((b, i) => (
                    <tr key={b.brand || i}>
                      <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5">{b.brand}</td>
                      <td className="py-1.5 text-right tabular-nums">{b.quantity.toLocaleString()}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmt(b.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer totals */}
          <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4 space-y-1">
            <div className="flex justify-between text-sm"><span>Order Tax (+)</span><span className="tabular-nums">{fmt(data.order_tax)}</span></div>
            <div className="flex justify-between text-sm"><span>Total Shipping Charges (+)</span><span className="tabular-nums">{fmt(data.shipping_total)}</span></div>
            <div className="flex justify-between text-base font-extrabold pt-1 border-t border-emerald-500/20"><span>Grand Total</span><span className="tabular-nums text-emerald-600">{fmt(data.grand_total)}</span></div>
          </div>

          <div className="flex justify-between text-xs text-muted-foreground px-1">
            <span>Orders: <b className="text-foreground">{data.order_count}</b></span>
            <span>Refunds: <b className="text-foreground">{data.refund_count}</b></span>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function TotalRow({ label, value, tone, bold }: { label: string; value: string; tone?: 'green' | 'red'; bold?: boolean }) {
  const color = tone === 'green' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : '';
  const bg = tone === 'green' ? 'bg-emerald-500/5' : tone === 'red' ? 'bg-red-500/5' : '';
  return (
    <div className={`flex justify-between px-4 py-2.5 ${bg} ${bold ? 'font-bold' : ''}`}>
      <span className={color}>{label}</span>
      <span className={`tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

// ── Recent Transactions ─────────────────────────────────────────────────────────
type RecentTab = 'final' | 'quotation' | 'draft';
const RECENT_TABS: { key: RecentTab; label: string; status?: string }[] = [
  { key: 'final', label: 'Final', status: 'completed,refunded,voided' },
  { key: 'quotation', label: 'Quotation' },
  { key: 'draft', label: 'Draft', status: 'draft,open,pending_payment' },
];
const RECENT_PAGE_SIZE = 10;

export function RecentTransactionsModal({ open, onClose, orgSlug }: { open: boolean; onClose: () => void; orgSlug: string }) {
  const router = useRouter();
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const fmt = (n: number | undefined) => formatCurrency(n, currency);
  const [tab, setTab] = useState<RecentTab>('final');
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; number: string } | null>(null);
  // REQ-001: quotation rows expand to show their saved line items (already present in the
  // treasury list payload — no extra fetch).
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);
  const voidOrder = useVoidOrder();
  // Quotation lifecycle (send/accept/decline/cancel) — treasury S2S via the pos-api proxy,
  // manager-gated on both sides (pos.orders.manage).
  const quotationAction = useQuotationAction();
  const { can } = usePermissions();
  const canManageQuotes = can('pos.orders.manage');

  const activeTab = RECENT_TABS.find((t) => t.key === tab)!;
  const isQuotation = tab === 'quotation';

  // Orders (Final / Draft tabs) and quotations (Quotation tab) — each server-paginated,
  // newest-first (the pos-api list is ordered created_at DESC).
  const ordersQ = useOrders({ status: activeTab.status, page, limit: RECENT_PAGE_SIZE });
  const quotesQ = useQuotations({ page, limit: RECENT_PAGE_SIZE }, open && isQuotation);

  if (!open) return null;

  const rows = isQuotation ? (quotesQ.data?.data ?? []) : (ordersQ.data?.data ?? []);
  const total = isQuotation
    ? (quotesQ.data?.meta?.total ?? quotesQ.data?.total ?? rows.length)
    : (ordersQ.data?.meta?.total ?? ordersQ.data?.total ?? rows.length);
  const totalPages = Math.max(1, Math.ceil(total / RECENT_PAGE_SIZE));
  const isLoading = isQuotation ? quotesQ.isLoading : ordersQ.isLoading;

  const go = (path: string) => { router.push(path); onClose(); };
  const switchTab = (t: RecentTab) => { setTab(t); setPage(1); };

  const handleDelete = () => {
    if (!confirmDelete) return;
    voidOrder.mutate(
      { orderId: confirmDelete.id, reason: 'Deleted from Recent Transactions' },
      {
        onSuccess: () => { toast.success(`Deleted ${confirmDelete.number}`); setConfirmDelete(null); },
        onError: (e: any) => toast.error(e?.response?.data?.error || 'Delete failed (may require manager approval)'),
      },
    );
  };

  return (
    <ModalShell title="Recent Transactions" icon={ClipboardList} onClose={onClose} size="2xl">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border -mt-1 mb-3">
        {RECENT_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">No {activeTab.label.toLowerCase()} transactions.</p>
      ) : isQuotation ? (
        <div className="divide-y divide-border">
          {rows.map((q: any, i: number) => {
            const qid = q.id ?? String(i);
            const qLines: any[] = q.lines ?? [];
            const expanded = expandedQuote === qid;
            return (
              <div key={qid} className="py-2.5">
                <button
                  className="w-full flex items-center justify-between gap-3 text-left"
                  onClick={() => setExpandedQuote(expanded ? null : qid)}
                  title={expanded ? 'Hide line items' : 'Show line items'}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {q.quote_number || q.quotation_number || q.number || q.id?.slice(0, 8)}
                      {q.customer_name ? <span className="text-muted-foreground font-normal"> ({q.customer_name})</span> : null}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {q.quote_date || q.created_at || ''}{qLines.length ? ` · ${qLines.length} item${qLines.length === 1 ? '' : 's'}` : ''}
                    </p>
                  </div>
                  <span className="font-bold text-sm tabular-nums shrink-0">{fmt(Number(q.total ?? q.total_amount ?? 0))}</span>
                </button>
                {expanded && (
                  <div className="mt-2 rounded-lg border border-border bg-accent/10 p-2 space-y-2">
                    {/* Lifecycle actions — the SAME treasury handlers treasury-ui's menu calls
                        (accept converts to an invoice). Manager-gated on both sides. */}
                    {canManageQuotes && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(q.status ?? 'draft') !== 'accepted' && (q.status ?? '') !== 'cancelled' && (q.status ?? '') !== 'converted' && (
                          <>
                            {(q.status === 'draft' || q.status === 'sent' || !q.status) && (
                              <button
                                onClick={() => quotationAction.mutate({ quotationId: qid, action: 'send' }, { onSuccess: () => toast.success('Quotation sent to customer'), onError: (e: any) => toast.error(e?.response?.data?.error || 'Send failed') })}
                                disabled={quotationAction.isPending}
                                className="px-2.5 py-1 rounded-lg border border-border text-xs font-semibold hover:bg-accent disabled:opacity-50"
                              >Send</button>
                            )}
                            <button
                              onClick={() => quotationAction.mutate({ quotationId: qid, action: 'accept' }, { onSuccess: () => toast.success('Quotation accepted → invoice created in Treasury'), onError: (e: any) => toast.error(e?.response?.data?.error || 'Accept failed') })}
                              disabled={quotationAction.isPending}
                              className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
                            >Accept → Invoice</button>
                            <button
                              onClick={() => quotationAction.mutate({ quotationId: qid, action: 'decline' }, { onSuccess: () => toast.success('Quotation declined'), onError: (e: any) => toast.error(e?.response?.data?.error || 'Decline failed') })}
                              disabled={quotationAction.isPending}
                              className="px-2.5 py-1 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-accent disabled:opacity-50"
                            >Decline</button>
                            <button
                              onClick={() => quotationAction.mutate({ quotationId: qid, action: 'cancel' }, { onSuccess: () => toast.success('Quotation cancelled'), onError: (e: any) => toast.error(e?.response?.data?.error || 'Cancel failed') })}
                              disabled={quotationAction.isPending}
                              className="px-2.5 py-1 rounded-lg border border-destructive/40 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            >Cancel</button>
                          </>
                        )}
                        {q.status && <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{q.status}</span>}
                      </div>
                    )}
                    {qLines.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-1 py-1">No line items on this quotation.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground text-left">
                            <th className="py-1 px-2 font-semibold">Item</th>
                            <th className="py-1 px-2 font-semibold">SKU</th>
                            <th className="py-1 px-2 font-semibold text-right">Qty</th>
                            <th className="py-1 px-2 font-semibold text-right">Unit Price</th>
                            <th className="py-1 px-2 font-semibold text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {qLines.map((l: any) => (
                            <tr key={l.id}>
                              <td className="py-1 px-2">{l.description || l.name}</td>
                              <td className="py-1 px-2 font-mono">{l.item_sku || l.sku || '—'}</td>
                              <td className="py-1 px-2 text-right tabular-nums">{Number(l.quantity)}</td>
                              <td className="py-1 px-2 text-right tabular-nums">{fmt(Number(l.unit_price))}</td>
                              <td className="py-1 px-2 text-right tabular-nums font-semibold">{fmt(Number(l.line_total ?? Number(l.quantity) * Number(l.unit_price)))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((o: any) => (
            <div key={o.id} className="flex items-center justify-between gap-3 py-2.5">
              <button onClick={() => go(`/${orgSlug}/orders/${o.id}`)} className="min-w-0 text-left flex-1">
                <p className="font-semibold text-sm truncate text-primary hover:underline">
                  {o.order_number}
                  {o.customer_name ? <span className="text-muted-foreground font-normal"> ({o.customer_name})</span> : null}
                </p>
                <p className="text-[11px] text-muted-foreground">{new Date(o.created_at).toLocaleString('en-KE')}</p>
              </button>
              <span className="font-bold text-sm tabular-nums shrink-0 w-24 text-right">{fmt(o.total_amount)}</span>
              <div className="flex items-center gap-1 shrink-0">
                {/* Edit → drafts go to Add Sale, finals open the order detail */}
                <button
                  onClick={() => go(o.status === 'draft' ? `/${orgSlug}/sell/add?order_id=${o.id}` : `/${orgSlug}/orders/${o.id}`)}
                  className="flex items-center gap-1 h-8 px-2.5 rounded-md border border-blue-500/40 text-blue-600 text-xs font-semibold hover:bg-blue-500/5"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                {o.status !== 'cancelled' && (
                  <PrintReceiptButton orderId={o.id} label="Print" className="h-8 px-2.5 text-xs" />
                )}
                <button
                  onClick={() => setConfirmDelete({ id: o.id, number: o.order_number })}
                  className="flex items-center gap-1 h-8 px-2.5 rounded-md border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/5"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} itemLabel="transactions" />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete transaction?"
        description={`This will void ${confirmDelete?.number}. This action may require manager approval.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
      />
    </ModalShell>
  );
}

// ── Sell Return (invoice lookup) ────────────────────────────────────────────────
export function SellReturnModal({ open, onClose, orgSlug }: { open: boolean; onClose: () => void; orgSlug: string }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState('');
  if (!open) return null;
  const submit = () => {
    const inv = invoice.trim();
    router.push(inv ? `/${orgSlug}/returns?invoice=${encodeURIComponent(inv)}` : `/${orgSlug}/returns`);
    onClose();
  };
  return (
    <ModalShell title="Sell Return" icon={RotateCcw} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Enter the invoice / receipt number to start a return.</p>
        <input
          autoFocus
          value={invoice}
          onChange={(e) => setInvoice(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Invoice No."
          className="w-full bg-background border border-border rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          onClick={submit}
          className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors"
        >
          Find Sale →
        </button>
      </div>
    </ModalShell>
  );
}
