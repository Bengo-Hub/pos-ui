'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, Loader2, Download, Plus, Minus } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { useOrders, useVoidOrder, type OrderListFilters } from '@/hooks/usePOS';
import { useStaffList } from '@/hooks/useStaff';
import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { usePermissions, P } from '@/hooks/usePermissions';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SellDetailsModal } from '@/components/pos/sell-details-modal';
import { SalesActionsMenu } from '@/components/pos/sales/sales-actions-menu';
import { SalesFilters, type SalesFilterState } from './sales-filters';
import { EditShippingModal } from './edit-shipping-modal';
import { ViewPaymentsModal } from './view-payments-modal';
import { money, payStatusBadge, prettyMethod } from './sales-shared';
import { toast } from 'sonner';

const PAGE_SIZE = 25;

const th = 'px-4 py-3 font-bold border border-border/60';
const td = 'px-4 py-3 border border-border/40';

/**
 * SalesListView — the All-Sales list: advanced filter bar, a rich sales table with
 * click-to-expand line items (treasury SharedDocumentList pattern), Sell Details modal,
 * and a permission-gated per-row Actions dropdown. Shared by the combined All-Sales page
 * and the POS-only page (which pins `source="pos_terminal"` and hides the Sources filter).
 * Cashier-role users (pos.orders.view_own without view/manage) see only their OWN sales —
 * enforced server-side — and the page renders as "My Sales" / "My POS Sales" for them.
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

  const { can, canAny } = usePermissions();
  // view_own-only principals get the scoped "My Sales" view (server enforces the scoping).
  const ownOnly = !canAny([P.ORDERS_VIEW, P.ORDERS_MANAGE, P.ORDERS_CHANGE]) && can(P.ORDERS_VIEW_OWN);
  const effectiveTitle = ownOnly ? (fixedSource ? 'My POS Sales' : 'My Sales') : title;
  const effectiveSubtitle = ownOnly ? 'Sales you rang up. Managers can see all sales.' : subtitle;

  const [page, setPage] = useState(1);
  // ?invoice= deep-links a specific sale here (e.g. from a return's "Original Order").
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('invoice') ?? '');
  const [filterState, setFilterState] = useState<SalesFilterState>({
    outletId: '', customer: '', paymentStatus: '', paymentMethod: '',
    shippingStatus: '', userId: '', source: '', subscriptions: false,
    range: { from: '', to: '' },
  });

  // Modals + row expansion
  const [detailId, setDetailId] = useState<string | null>(null);
  const [shippingOrder, setShippingOrder] = useState<any>(null);
  const [paymentsOrder, setPaymentsOrder] = useState<any>(null);
  const [deleteOrder, setDeleteOrder] = useState<any>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const staffQ = useStaffList(tenantId, filterState.outletId || undefined);
  const staff = (staffQ.data as any)?.data ?? staffQ.data ?? [];
  const staffNameByUserId = useMemo(
    () => Object.fromEntries(staff.map((s: any) => [s.user_id, s.name])),
    [staff],
  );
  const voidOrder = useVoidOrder();

  const filters: OrderListFilters = useMemo(() => ({
    // This page shows every sale (no status filter); "all" outlets unless narrowed.
    outletId: filterState.outletId || 'all',
    from: filterState.range.from || undefined,
    to: filterState.range.to || undefined,
    customer: filterState.customer.trim() || undefined,
    paymentStatus: filterState.paymentStatus || undefined,
    paymentMethod: filterState.paymentMethod || undefined,
    shippingStatus: filterState.shippingStatus || undefined,
    userId: filterState.userId || undefined,
    source: fixedSource ?? (filterState.source || undefined),
    subscriptions: filterState.subscriptions || undefined,
    orderNumber: search.trim() || undefined,
    page,
    limit: PAGE_SIZE,
  }), [filterState, fixedSource, search, page]);

  const { data, isLoading } = useOrders(filters);
  const rows: any[] = data?.data ?? [];
  const total = data?.meta?.total ?? (data as any)?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const patchFilters = (patch: Partial<SalesFilterState>) => { setFilterState((s) => ({ ...s, ...patch })); setPage(1); };

  const toggleExpand = (id: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

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

  const colCount = 15;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{effectiveTitle}</h1>
          <p className="text-muted-foreground mt-1">{effectiveSubtitle}</p>
        </div>
      </div>

      <SalesFilters state={filterState} onChange={patchFilters} outlets={outlets} staff={staff} fixedSource={fixedSource} hideUserFilter={ownOnly} />

      <Card>
        <CardHeader className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between py-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input placeholder="Search by invoice #..." className="w-full bg-accent/30 border-none rounded-lg py-2 pl-10 pr-4 text-sm"
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Button variant="outline" className="gap-2" disabled><Download className="h-4 w-4" /> Export</Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-accent/5 text-xs uppercase tracking-wider text-muted-foreground">
                      <th className={`${th} w-8 text-center`} aria-label="Expand" />
                      <th className={`${th} text-left`}>Action</th>
                      <th className={`${th} text-left`}>Date</th>
                      <th className={`${th} text-left`}>Invoice No.</th>
                      <th className={`${th} text-left`}>Customer</th>
                      <th className={`${th} text-left`}>Contact</th>
                      <th className={`${th} text-left`}>Cashier</th>
                      <th className={`${th} text-left`}>Outlet</th>
                      <th className={`${th} text-center`}>Payment Status</th>
                      <th className={`${th} text-left`}>Payment Method</th>
                      <th className={`${th} text-right`}>Total</th>
                      <th className={`${th} text-right`}>Paid</th>
                      <th className={`${th} text-right`}>Sell Due</th>
                      <th className={`${th} text-left`}>Shipping</th>
                      <th className={`${th} text-center`}>Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((o) => (
                      <SaleRow key={o.id} order={o} orgSlug={orgSlug}
                        expanded={expandedRows.has(o.id)} onToggleExpand={() => toggleExpand(o.id)}
                        onOpenDetail={() => setDetailId(o.id)}
                        cashierName={staffNameByUserId[o.user_id]}
                        outletName={outletNameById[o.outlet_id]}
                        // Own-only users can't pivot the list to another cashier (QA req 6).
                        onCashierClick={ownOnly ? undefined : (userId) => patchFilters({ userId })}
                        onEditShipping={setShippingOrder} onViewPayments={setPaymentsOrder}
                        onDelete={setDeleteOrder} colCount={colCount} />
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

/** One sale row + its optional expanded line-items panel (treasury-style sibling <tr>). */
function SaleRow({ order: o, orgSlug, expanded, onToggleExpand, onOpenDetail, cashierName, outletName, onCashierClick, onEditShipping, onViewPayments, onDelete, colCount }: {
  order: any; orgSlug: string; expanded: boolean;
  onToggleExpand: () => void; onOpenDetail: () => void;
  cashierName?: string; outletName?: string;
  onCashierClick?: (userId: string) => void;
  onEditShipping: (o: any) => void; onViewPayments: (o: any) => void; onDelete: (o: any) => void;
  colCount: number;
}) {
  const lines: any[] = o.edges?.lines ?? [];
  return (
    <>
      <tr className="hover:bg-accent/5 transition-colors cursor-pointer" onClick={onOpenDetail}>
        <td className={`${td} text-center`} onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}>
          <button className="h-6 w-6 rounded-md border border-border inline-flex items-center justify-center hover:bg-accent"
            aria-label={expanded ? 'Collapse line items' : 'Expand line items'}>
            {expanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
        </td>
        <td className={td} onClick={(e) => e.stopPropagation()}>
          <SalesActionsMenu order={o} orgSlug={orgSlug} onView={onOpenDetail}
            onEditShipping={onEditShipping} onViewPayments={onViewPayments} onDelete={onDelete} />
        </td>
        <td className={`${td} text-xs text-muted-foreground`}>{new Date(o.created_at).toLocaleString('en-KE')}</td>
        <td className={`${td} font-mono text-xs font-bold text-primary`}>{o.order_number}</td>
        <td className={td} onClick={(e) => e.stopPropagation()}>
          {o.customer_phone ? (
            <Link href={`/${orgSlug}/clients?q=${encodeURIComponent(o.customer_phone)}`}
              className="text-primary hover:underline" title="Open customer profile">
              {o.customer_name || 'Walk-In Customer'}
            </Link>
          ) : (o.customer_name || 'Walk-In Customer')}
        </td>
        <td className={`${td} text-xs`}>
          {o.customer_phone ? (
            <Link href={`/${orgSlug}/clients?q=${encodeURIComponent(o.customer_phone)}`}
              className="hover:underline" onClick={(e) => e.stopPropagation()}>
              {o.customer_phone}
            </Link>
          ) : '—'}
        </td>
        <td className={`${td} text-xs`} onClick={(e) => e.stopPropagation()}>
          {cashierName && o.user_id && onCashierClick ? (
            <button className="text-primary hover:underline" title="Filter sales by this cashier"
              onClick={() => onCashierClick(o.user_id)}>
              {cashierName}
            </button>
          ) : (cashierName || '—')}
        </td>
        <td className={`${td} text-xs`}>{outletName || '—'}</td>
        <td className={`${td} text-center`}>{payStatusBadge(o.payment_status)}</td>
        <td className={`${td} text-xs capitalize`}>{prettyMethod(o.payment_method)}</td>
        <td className={`${td} text-right font-semibold tabular-nums`}>{money(o.total_amount)}</td>
        <td className={`${td} text-right tabular-nums`}>{money(o.total_paid)}</td>
        <td className={`${td} text-right tabular-nums`}>{o.amount_due > 0.01 ? money(o.amount_due) : '—'}</td>
        <td className={`${td} text-xs capitalize`}>{o.metadata?.shipping_status || '—'}</td>
        <td className={`${td} text-center text-xs`}>{o.item_count ?? lines.length}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={colCount} className="bg-accent/10 px-6 py-3 border border-border/40">
            {lines.length === 0 ? (
              <div className="text-xs text-muted-foreground py-1">No line items on this sale.</div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-muted-foreground uppercase tracking-wider">
                    <th className="text-left py-1.5 px-2 border border-border/40 font-semibold">Item</th>
                    <th className="text-left py-1.5 px-2 border border-border/40 font-semibold">SKU</th>
                    <th className="text-right py-1.5 px-2 border border-border/40 font-semibold">Qty</th>
                    <th className="text-right py-1.5 px-2 border border-border/40 font-semibold">Unit Price</th>
                    <th className="text-right py-1.5 px-2 border border-border/40 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l: any) => (
                    <tr key={l.id}>
                      <td className="py-1.5 px-2 border border-border/40">{l.name}</td>
                      <td className="py-1.5 px-2 border border-border/40 font-mono">{l.sku || '—'}</td>
                      <td className="py-1.5 px-2 border border-border/40 text-right tabular-nums">{l.quantity}</td>
                      <td className="py-1.5 px-2 border border-border/40 text-right tabular-nums">{money(l.unit_price)}</td>
                      <td className="py-1.5 px-2 border border-border/40 text-right tabular-nums font-semibold">{money(l.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
