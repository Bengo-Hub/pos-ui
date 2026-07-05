'use client';

import { useMemo, useState } from 'react';
import { Search, Filter, Loader2, X, Download } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { useOrders, useUpdateShipping, useOrderPayments, useVoidOrder, type OrderListFilters } from '@/hooks/usePOS';
import { useStaffList } from '@/hooks/useStaff';
import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { Pagination } from '@/components/ui/pagination';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SellDetailsModal } from '@/components/pos/sell-details-modal';
import { SalesActionsMenu } from '@/components/pos/sales/sales-actions-menu';
import { toast } from 'sonner';

const PAGE_SIZE = 25;
const money = (n: number) => `KSh ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAYMENT_METHODS = [
  { value: '', label: 'All' }, { value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' },
  { value: 'card_manual', label: 'Card / PDQ' }, { value: 'cheque', label: 'Cheque' },
  { value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'mpesa', label: 'M-Pesa' },
  { value: 'on_account', label: 'On Account' },
];
const PAYMENT_STATUSES = [{ value: '', label: 'All' }, { value: 'paid', label: 'Paid' }, { value: 'due', label: 'Due' }, { value: 'partial', label: 'Partial' }];
const SHIPPING_STATUSES = [{ value: '', label: 'All' }, { value: 'ordered', label: 'Ordered' }, { value: 'packed', label: 'Packed' }, { value: 'shipped', label: 'Shipped' }, { value: 'delivered', label: 'Delivered' }, { value: 'cancelled', label: 'Cancelled' }];
const SOURCES = [{ value: '', label: 'All' }, { value: 'pos_terminal', label: 'POS' }, { value: 'back_office', label: 'Back Office (Add Sale)' }];

const prettyMethod = (m: string) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? (m === 'multiple' ? 'Multiple' : m ? m.replace(/_/g, ' ') : '—');

function payStatusBadge(s: string) {
  if (s === 'paid') return <Badge variant="success">Paid</Badge>;
  if (s === 'partial') return <Badge variant="warning">Partial</Badge>;
  if (s === 'refunded' || s === 'voided' || s === 'cancelled') return <Badge variant="error">{s}</Badge>;
  return <Badge variant="default">Due</Badge>;
}

/**
 * SalesListView — the GoDigital-style All-Sales list: advanced filter bar, a rich sales table
 * whose rows open the Sell Details modal, and a per-row Actions dropdown. Shared by the combined
 * All-Sales page and the POS-only page (which pins `source="pos_terminal"` and hides the Sources
 * filter). All filtering is server-side (pos-api ListOrders); pagination is server-side too.
 */
export function SalesListView({ orgSlug, fixedSource, title, subtitle }: {
  orgSlug: string;
  fixedSource?: string;         // pins the Sources filter (POS-only page)
  title: string;
  subtitle: string;
}) {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';
  const outlets = useOutletFilterStore((s) => s.outlets);
  const outletNameById = useMemo(() => Object.fromEntries(outlets.map((o) => [o.id, o.name])), [outlets]);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [outletId, setOutletId] = useState('');
  const [customer, setCustomer] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [shippingStatus, setShippingStatus] = useState('');
  const [userId, setUserId] = useState('');
  const [source, setSource] = useState('');
  const [subscriptions, setSubscriptions] = useState(false);
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });

  // Modals
  const [detailId, setDetailId] = useState<string | null>(null);
  const [shippingOrder, setShippingOrder] = useState<any>(null);
  const [paymentsOrder, setPaymentsOrder] = useState<any>(null);
  const [deleteOrder, setDeleteOrder] = useState<any>(null);

  const staffQ = useStaffList(tenantId, outletId || undefined);
  const staff = (staffQ.data as any)?.data ?? staffQ.data ?? [];
  const voidOrder = useVoidOrder();

  const filters: OrderListFilters = useMemo(() => ({
    // Combine "final + drafts + all"; this page shows every sale, so no status filter by default.
    outletId: outletId || 'all',
    from: range.from || undefined,
    to: range.to || undefined,
    customer: customer.trim() || undefined,
    paymentStatus: paymentStatus || undefined,
    paymentMethod: paymentMethod || undefined,
    shippingStatus: shippingStatus || undefined,
    userId: userId || undefined,
    source: fixedSource ?? (source || undefined),
    subscriptions: subscriptions || undefined,
    orderNumber: search.trim() || undefined,
    page,
    limit: PAGE_SIZE,
  }), [outletId, range, customer, paymentStatus, paymentMethod, shippingStatus, userId, source, fixedSource, subscriptions, search, page]);

  const { data, isLoading } = useOrders(filters);
  const rows: any[] = data?.data ?? [];
  const total = data?.meta?.total ?? (data as any)?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };

  const handleDelete = () => {
    if (!deleteOrder) return;
    voidOrder.mutate(
      { orderId: deleteOrder.id, reason: 'Deleted from Sales list' },
      {
        onSuccess: () => { toast.success(`Deleted ${deleteOrder.order_number}`); setDeleteOrder(null); },
        onError: (e: any) => toast.error(e?.response?.data?.error || 'Delete failed (may require manager approval)'),
      },
    );
  };

  const selectCls = 'w-full bg-accent/30 border border-border rounded-lg py-2 px-3 text-sm';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1">{subtitle}</p>
        </div>
      </div>

      {/* Filter bar */}
      <Card>
        <CardHeader className="pb-3"><div className="flex items-center gap-2 text-sm font-semibold"><Filter className="h-4 w-4 text-primary" /> Filters</div></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="text-[11px] font-semibold text-muted-foreground">Business Location
            <select className={selectCls} value={outletId} onChange={(e) => resetPage(setOutletId)(e.target.value)}>
              <option value="">All</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">Customer
            <input className={selectCls} placeholder="Name or phone" value={customer} onChange={(e) => resetPage(setCustomer)(e.target.value)} />
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">Payment Status
            <select className={selectCls} value={paymentStatus} onChange={(e) => resetPage(setPaymentStatus)(e.target.value)}>
              {PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <div className="text-[11px] font-semibold text-muted-foreground">Date Range
            <DateRangePicker value={range} onChange={resetPage(setRange)} className="mt-0.5" />
          </div>
          <label className="text-[11px] font-semibold text-muted-foreground">User
            <select className={selectCls} value={userId} onChange={(e) => resetPage(setUserId)(e.target.value)}>
              <option value="">All</option>
              {staff.map((s: any) => <option key={s.id} value={s.user_id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">Shipping Status
            <select className={selectCls} value={shippingStatus} onChange={(e) => resetPage(setShippingStatus)(e.target.value)}>
              {SHIPPING_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">Payment Method
            <select className={selectCls} value={paymentMethod} onChange={(e) => resetPage(setPaymentMethod)(e.target.value)}>
              {PAYMENT_METHODS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          {!fixedSource && (
            <label className="text-[11px] font-semibold text-muted-foreground">Sources
              <select className={selectCls} value={source} onChange={(e) => resetPage(setSource)(e.target.value)}>
                {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm font-medium self-end pb-2">
            <input type="checkbox" checked={subscriptions} onChange={(e) => resetPage(setSubscriptions)(e.target.checked)} className="h-4 w-4" />
            Subscriptions
          </label>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between py-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input placeholder="Search by invoice #..." className="w-full bg-accent/30 border-none rounded-lg py-2 pl-10 pr-4 text-sm"
              value={search} onChange={(e) => resetPage(setSearch)(e.target.value)} />
          </div>
          <Button variant="outline" className="gap-2" disabled><Download className="h-4 w-4" /> Export</Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-border bg-accent/5 text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="text-left px-4 py-3 font-bold">Action</th>
                      <th className="text-left px-4 py-3 font-bold">Date</th>
                      <th className="text-left px-4 py-3 font-bold">Invoice No.</th>
                      <th className="text-left px-4 py-3 font-bold">Customer</th>
                      <th className="text-left px-4 py-3 font-bold">Contact</th>
                      <th className="text-left px-4 py-3 font-bold">Location</th>
                      <th className="text-center px-4 py-3 font-bold">Payment Status</th>
                      <th className="text-left px-4 py-3 font-bold">Payment Method</th>
                      <th className="text-right px-4 py-3 font-bold">Total</th>
                      <th className="text-right px-4 py-3 font-bold">Paid</th>
                      <th className="text-right px-4 py-3 font-bold">Sell Due</th>
                      <th className="text-left px-4 py-3 font-bold">Shipping</th>
                      <th className="text-center px-4 py-3 font-bold">Items</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((o) => (
                      <tr key={o.id} className="hover:bg-accent/5 transition-colors cursor-pointer" onClick={() => setDetailId(o.id)}>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <SalesActionsMenu order={o} orgSlug={orgSlug} onView={(ord) => setDetailId(ord.id)}
                            onEditShipping={setShippingOrder} onViewPayments={setPaymentsOrder} onDelete={setDeleteOrder} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString('en-KE')}</td>
                        <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{o.order_number}</td>
                        <td className="px-4 py-3">{o.customer_name || 'Walk-In Customer'}</td>
                        <td className="px-4 py-3 text-xs">{o.customer_phone || '—'}</td>
                        <td className="px-4 py-3 text-xs">{outletNameById[o.outlet_id] || '—'}</td>
                        <td className="px-4 py-3 text-center">{payStatusBadge(o.payment_status)}</td>
                        <td className="px-4 py-3 text-xs capitalize">{prettyMethod(o.payment_method)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(o.total_amount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{money(o.total_paid)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{o.amount_due > 0.01 ? money(o.amount_due) : '—'}</td>
                        <td className="px-4 py-3 text-xs capitalize">{o.metadata?.shipping_status || '—'}</td>
                        <td className="px-4 py-3 text-center text-xs">{o.item_count ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && <div className="p-12 text-center text-muted-foreground">No sales match your filters.</div>}
              </div>
              <div className="px-4"><Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} itemLabel="sales" /></div>
            </>
          )}
        </CardContent>
      </Card>

      {detailId && <SellDetailsModal orderId={detailId} orgSlug={orgSlug} onClose={() => setDetailId(null)} />}
      {shippingOrder && <EditShippingModal order={shippingOrder} onClose={() => setShippingOrder(null)} />}
      {paymentsOrder && <ViewPaymentsModal order={paymentsOrder} onClose={() => setPaymentsOrder(null)} />}
      <ConfirmDialog open={!!deleteOrder} onOpenChange={(o) => !o && setDeleteOrder(null)} title="Delete sale?"
        description={`This will void ${deleteOrder?.order_number}. It may require manager approval and will reverse the sale in treasury/inventory.`}
        confirmLabel="Delete" variant="danger" onConfirm={handleDelete} />
    </div>
  );
}

// ── Edit Shipping modal ──────────────────────────────────────────────────────────
function EditShippingModal({ order, onClose }: { order: any; onClose: () => void }) {
  const update = useUpdateShipping();
  const [form, setForm] = useState({
    shipping_status: order.metadata?.shipping_status ?? 'ordered',
    shipping_address: order.metadata?.shipping_address ?? '',
    shipping_amount: order.metadata?.shipping_amount ?? 0,
    tracking_number: order.metadata?.tracking_number ?? '',
    delivery_person: order.metadata?.delivery_person ?? '',
  });
  const save = () => {
    update.mutate(
      { orderId: order.id, ...form, shipping_amount: Number(form.shipping_amount) },
      { onSuccess: () => { toast.success('Shipping updated'); onClose(); }, onError: () => toast.error('Update failed') },
    );
  };
  const inp = 'w-full bg-background border border-border rounded-lg py-2 px-3 text-sm';
  return (
    <ModalFrame title={`Edit Shipping — ${order.order_number}`} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-muted-foreground">Shipping Status
          <select className={inp} value={form.shipping_status} onChange={(e) => setForm({ ...form, shipping_status: e.target.value })}>
            {SHIPPING_STATUSES.filter((s) => s.value).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-muted-foreground">Address
          <input className={inp} value={form.shipping_address} onChange={(e) => setForm({ ...form, shipping_address: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-muted-foreground">Shipping Charges
            <input type="number" className={inp} value={form.shipping_amount} onChange={(e) => setForm({ ...form, shipping_amount: e.target.value as any })} />
          </label>
          <label className="block text-xs font-semibold text-muted-foreground">Tracking No.
            <input className={inp} value={form.tracking_number} onChange={(e) => setForm({ ...form, tracking_number: e.target.value })} />
          </label>
        </div>
        <label className="block text-xs font-semibold text-muted-foreground">Delivery Person
          <input className={inp} value={form.delivery_person} onChange={(e) => setForm({ ...form, delivery_person: e.target.value })} />
        </label>
        <Button className="w-full" onClick={save} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Shipping'}
        </Button>
      </div>
    </ModalFrame>
  );
}

// ── View Payments modal ──────────────────────────────────────────────────────────
function ViewPaymentsModal({ order, onClose }: { order: any; onClose: () => void }) {
  const { data, isLoading } = useOrderPayments(order.id);
  const payments = (data as any)?.data ?? data ?? [];
  return (
    <ModalFrame title={`Payments — ${order.order_number}`} onClose={onClose}>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : payments.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">No payments recorded.</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground border-b border-border"><th className="py-2">Date</th><th className="py-2">Reference</th><th className="py-2 text-right">Amount</th><th className="py-2">Status</th></tr></thead>
          <tbody className="divide-y divide-border">
            {payments.map((p: any, i: number) => (
              <tr key={p.id ?? i}>
                <td className="py-2">{p.occurred_at ? new Date(p.occurred_at).toLocaleDateString('en-KE') : '—'}</td>
                <td className="py-2 text-xs">{p.external_reference || String(p.id ?? '').slice(0, 10)}</td>
                <td className="py-2 text-right tabular-nums">{money(p.amount)}</td>
                <td className="py-2 text-xs capitalize">{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ModalFrame>
  );
}

function ModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold text-base">{title}</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
