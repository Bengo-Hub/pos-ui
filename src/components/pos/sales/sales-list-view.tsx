'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { RefreshCw, Search, Undo2, XCircle } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';
import { useOrders, useOrdersSummary, useBulkVoidOrders, useDeleteSale, prefetchOrder, type OrderListFilters } from '@/hooks/usePOS';
import { useCloseOnAccount } from '@/hooks/use-close-on-account';
import { useStaffList } from '@/hooks/useStaff';
import { usePermissions, P } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { useOwnScope } from '@/lib/rbac/scope';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SellDetailsModal } from '@/components/pos/sell-details-modal';
import { SalesActionsMenu } from '@/components/pos/sales/sales-actions-menu';
import { SalesFilters, type SalesFilterState } from './sales-filters';
import { rangeBound } from '@/components/ui/date-range-picker';
import { EditShippingModal } from './edit-shipping-modal';
import { RecordPaymentModal } from './record-payment-modal';
import { CustomerDetailsModal } from '@/components/pos/customers/customer-details-modal';
import { ViewPaymentsModal } from './view-payments-modal';
import { EditOrderLinesModal } from './edit-order-lines-modal';
import { MoveOrderDateModal } from './move-order-date-modal';
import { EditSaleInfoModal } from './edit-sale-info-modal';
import { money, payStatusBadge, prettyMethod, PAYMENT_STATUSES, SOURCES } from './sales-shared';
import { cashierNameOf, OrderLinesPanel, SalesSummaryFooter, BulkVoidReasonDialog, skippedSummary } from './sales-table-shared';
import { ReportExportButtons } from '@/components/reports/report-document-button';
import { toast } from 'sonner';

// Statuses pos-api's bulk-void refuses (voidSkipReason): already voided, or finalized
// (completed/paid/closed — ledger + KRA eTIMS state; reverse via a return/refund instead).
// Mirrored client-side so ineligible rows aren't selectable — fewer server skips.
const BULK_VOID_INELIGIBLE = new Set(['voided', 'completed', 'paid', 'closed']);

/**
 * SalesListView — the All-Sales list on the shared platform DataTable: advanced filter bar,
 * sortable/funnel-filterable columns, click-to-expand line items, Sell Details modal, a
 * permission-gated per-row Actions dropdown and a manager-only bulk Void action. Shared by the
 * combined All-Sales page and the POS-only page (which pins `source="pos_terminal"`).
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
  const qc = useQueryClient();
  // Warms the ['pos-order', tenantId, id] cache the moment a row's actions menu is hovered/opened —
  // by the time Edit Sale is actually clicked, the order detail fetch is often already resolved,
  // so /sell/add?edit_inplace=<id> paints the cart immediately instead of blanking on a cold fetch.
  const handlePrefetchOrder = useCallback((o: any) => prefetchOrder(qc, tenantId, o.id), [qc, tenantId]);
  const outlets = useOutletFilterStore((s) => s.outlets);
  const selectedOutlet = useOutletFilterStore((s) => s.selectedOutlet);
  const outletNameById = useMemo(() => Object.fromEntries(outlets.map((o) => [o.id, o.name])), [outlets]);

  // view_own-only principals get the scoped "My Sales" view (server enforces the scoping).
  const { ownOnly } = useOwnScope();
  // Bulk void is a manager authority — same pos.orders.manage gate the server route enforces
  // (the <Can>/usePermissions convention; this is UX, the server is the boundary).
  const { can } = usePermissions();
  const canBulkVoid = can(P.ORDERS_MANAGE);
  const effectiveTitle = ownOnly ? (fixedSource ? 'My POS Sales' : 'My Sales') : title;
  const effectiveSubtitle = ownOnly ? 'Sales you rang up. Managers can see all sales.' : subtitle;

  const router = useRouter();
  const pathname = usePathname();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // ?invoice= deep-links a specific sale here (e.g. from a return's "Original Order").
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('invoice') ?? '');
  const [filterState, setFilterState] = useState<SalesFilterState>({
    // The page's Outlets filter PRESELECTS the globally selected outlet (top-nav switcher).
    outletId: selectedOutlet?.id ?? '', customer: '', paymentStatus: '', paymentMethod: '',
    shippingStatus: '', userId: '', source: '', subscriptions: false,
    range: { from: '', to: '' }, minTotal: '', maxTotal: '',
  });

  // Follow the global switcher: changing the drilled-in outlet re-scopes this page too.
  useEffect(() => {
    const globalOutlet = selectedOutlet?.id ?? '';
    setFilterState((f) => (f.outletId === globalOutlet ? f : { ...f, outletId: globalOutlet }));
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOutlet?.id]);

  // Modals + bulk selection
  const [detailId, setDetailId] = useState<string | null>(null);
  const [shippingOrder, setShippingOrder] = useState<any>(null);
  const [paymentsOrder, setPaymentsOrder] = useState<any>(null);
  const [editLinesOrder, setEditLinesOrder] = useState<any>(null);
  const [moveDateOrder, setMoveDateOrder] = useState<any>(null);
  const [deleteSaleOrder, setDeleteSaleOrder] = useState<any>(null);
  const [recordPayOrder, setRecordPayOrder] = useState<any>(null);
  const [editSaleInfoOrder, setEditSaleInfoOrder] = useState<any>(null);
  const [putOnAccountOrder, setPutOnAccountOrder] = useState<any>(null);
  const [customerModal, setCustomerModal] = useState<{ name?: string | null; phone: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkVoidKeys, setBulkVoidKeys] = useState<string[] | null>(null);

  // Staff list is still needed for the "Created By" FILTER dropdown (SalesFilters) and as the
  // display fallback for rows whose server-resolved cashier_name came back empty.
  const staffQ = useStaffList(tenantId, filterState.outletId || undefined);
  const staff = (staffQ.data as any)?.data ?? staffQ.data ?? [];
  const staffNameByUserId = useMemo(
    () => Object.fromEntries(staff.map((s: any) => [s.user_id, s.name])),
    [staff],
  );
  const deleteSale = useDeleteSale();
  const bulkVoid = useBulkVoidOrders();
  const closeOnAccount = useCloseOnAccount();

  const filters: OrderListFilters = useMemo(() => ({
    // This page shows every sale (no status filter); "all" outlets unless narrowed.
    outletId: filterState.outletId || 'all',
    from: rangeBound(filterState.range.from, filterState.range.fromTime) || undefined,
    to: rangeBound(filterState.range.to, filterState.range.toTime) || undefined,
    customer: filterState.customer.trim() || undefined,
    paymentStatus: filterState.paymentStatus || undefined,
    paymentMethod: filterState.paymentMethod || undefined,
    shippingStatus: filterState.shippingStatus || undefined,
    userId: filterState.userId || undefined,
    source: fixedSource ?? (filterState.source || undefined),
    subscriptions: filterState.subscriptions || undefined,
    minTotal: filterState.minTotal === '' ? undefined : filterState.minTotal,
    maxTotal: filterState.maxTotal === '' ? undefined : filterState.maxTotal,
    orderNumber: search.trim() || undefined,
    page,
    limit: pageSize,
  }), [filterState, fixedSource, search, page, pageSize]);

  const { data, isLoading, refetch, isFetching } = useOrders(filters);
  // Grand totals across the whole filtered set (all pages), fetched independently of the
  // paginated list so the footer stays put while the user pages through rows.
  const { data: summary, refetch: refetchSummary } = useOrdersSummary(filters);
  // Manual fallback: no push event invalidates ['pos-orders']/['pos-orders-summary'] today (the
  // notifications WS only nudges catalog/credit/KDS caches), so a sale rung up on another till —
  // or a payment confirmed from treasury — won't appear here until this is clicked or re-navigated to.
  const refreshAll = useCallback(() => { void refetch(); void refetchSummary(); }, [refetch, refetchSummary]);
  const rows: any[] = data?.data ?? [];
  const total = data?.meta?.total ?? (data as any)?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Export params — the SAME query keys the list request sends (pos-api builds both from one
  // shared filter helper), so the PDF/CSV always contains exactly the rows on screen.
  const exportParams = useMemo(() => ({
    outlet_id: filters.outletId,
    from: filters.from,
    to: filters.to,
    customer: filters.customer,
    payment_status: filters.paymentStatus,
    payment_method: filters.paymentMethod,
    shipping_status: filters.shippingStatus,
    user_id: filters.userId,
    source: filters.source,
    subscriptions: filters.subscriptions ? 'true' : undefined,
    min_total: filters.minTotal != null ? String(filters.minTotal) : undefined,
    max_total: filters.maxTotal != null ? String(filters.maxTotal) : undefined,
    order_number: filters.orderNumber,
  }), [filters]);
  const exportStamp = new Date().toISOString().slice(0, 10);

  // Selection is cleared whenever the visible row set changes (filter/page) so a bulk action
  // never silently includes rows the manager can no longer see.
  const patchFilters = useCallback((patch: Partial<SalesFilterState>) => {
    setFilterState((s) => ({ ...s, ...patch }));
    setPage(1);
    setSelected(new Set());
  }, []);
  const goToPage = useCallback((p: number) => { setPage(p); setSelected(new Set()); }, []);

  // Permanent Delete Sale ("shred" tool) — branches server-side on fiscal status: a sale already
  // reported to KRA is reversed + soft-marked deleted (never removed); a plain cash sale is
  // genuinely hard-deleted with a permanent shred-receipt audit snapshot kept.
  const handleDeleteSale = () => {
    if (!deleteSaleOrder) return;
    deleteSale.mutate(
      { orderId: deleteSaleOrder.id, reason: 'Deleted from Sales list' },
      {
        onSuccess: (res: any) => {
          const msg = res?.branch === 'fiscalized'
            ? `${deleteSaleOrder.order_number} was reported to KRA — reversed and voided (not removed).`
            : `${deleteSaleOrder.order_number} permanently deleted.`;
          toast.success(msg);
          setDeleteSaleOrder(null);
        },
        onError: (e: any) => toast.error(e?.response?.data?.error || 'Delete failed'),
      },
    );
  };

  // Edit a FINALIZED sale: opens the true in-place editor directly — nothing is reversed just
  // to open it (only Save actually reduces/reverses whatever was actually removed/lowered).
  const handleEditFinalizedSale = (order: any) => {
    // Carry this list's own route back so Add Sale can return here (All Sales vs POS-only
    // Sales both render this component) once the edit is saved, instead of always landing on
    // a blank Add Sale screen.
    router.push(`/${orgSlug}/sell/add?edit_inplace=${order.id}&return_to=${encodeURIComponent(pathname)}`);
  };

  const handlePutOnAccount = () => {
    if (!putOnAccountOrder) return;
    closeOnAccount.mutate(
      { orderId: putOnAccountOrder.id },
      {
        onSuccess: () => {
          toast.success(`${putOnAccountOrder.order_number} put on account — now on ${putOnAccountOrder.customer_name || 'the customer'}'s treasury balance`);
          setPutOnAccountOrder(null);
        },
        onError: (e: any) => toast.error(e?.response?.data?.error || 'Could not put the balance on account — check the customer and their credit limit.'),
      },
    );
  };

  const handleBulkVoid = (reason: string) => {
    if (!bulkVoidKeys?.length) return;
    bulkVoid.mutate(
      { orderIds: bulkVoidKeys, reason },
      {
        onSuccess: (res) => {
          const skips = skippedSummary(res.skipped);
          if (res.voided > 0) {
            toast.success(`Voided ${res.voided} sale${res.voided === 1 ? '' : 's'}`, skips ? { description: skips } : undefined);
          } else {
            toast.info('No sales were voided', skips ? { description: skips } : undefined);
          }
          setSelected(new Set());
          setBulkVoidKeys(null);
        },
        onError: (e: any) => toast.error(e?.response?.data?.error || 'Bulk void failed'),
      },
    );
  };

  const columns = useMemo<DataTableColumn<any>[]>(() => [
    {
      key: 'action', header: 'Action', exportable: false, mobileAction: true,
      render: (o) => (
        <SalesActionsMenu order={o} orgSlug={orgSlug} onView={(ord) => setDetailId(ord.id)}
          onEditShipping={setShippingOrder} onViewPayments={setPaymentsOrder} onEditLines={setEditLinesOrder}
          onMoveDate={setMoveDateOrder} onDeleteSale={setDeleteSaleOrder}
          onEditFinalizedSale={handleEditFinalizedSale}
          onPrefetchEdit={handlePrefetchOrder}
          onRecordPayment={setRecordPayOrder}
          onPutOnAccount={setPutOnAccountOrder} onEditSaleInfo={setEditSaleInfoOrder} />
      ),
    },
    {
      key: 'date', header: 'Date', sortable: true, accessor: (o) => o.created_at,
      render: (o) => <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(o.created_at).toLocaleString('en-KE')}</span>,
    },
    {
      key: 'invoice', header: 'Invoice No.', primary: true, accessor: (o) => o.order_number,
      render: (o) => (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-primary whitespace-nowrap">
          {o.order_number}
          {(o.return_count ?? 0) > 0 && (
            <Link href={`/${orgSlug}/returns`} onClick={(e) => e.stopPropagation()}
              title={`${o.return_count} sell return${o.return_count > 1 ? 's' : ''} (${o.return_status}) — ${money(o.return_total, o.currency)}`}
              aria-label="View sell returns for this sale"
              className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-500/15 text-red-600 hover:bg-red-500/25">
              <Undo2 className="h-3 w-3" />
            </Link>
          )}
        </span>
      ),
    },
    {
      // Customer opens the reusable profile modal (details, credit position, order history).
      key: 'customer', header: 'Customer', sortable: true,
      accessor: (o) => o.customer_name || 'Walk-in',
      render: (o) => o.customer_phone ? (
        <button type="button"
          onClick={(e) => { e.stopPropagation(); setCustomerModal({ name: o.customer_name, phone: o.customer_phone }); }}
          className="text-primary hover:underline text-left" title="Open customer profile">
          {o.customer_name || 'Walk-in'}
        </button>
      ) : (o.customer_name || 'Walk-in'),
    },
    {
      key: 'contact', header: 'Contact', mobileHidden: true, accessor: (o) => o.customer_phone ?? '',
      render: (o) => o.customer_phone ? (
        <button type="button" className="text-xs hover:underline"
          onClick={(e) => { e.stopPropagation(); setCustomerModal({ name: o.customer_name, phone: o.customer_phone }); }}>
          {o.customer_phone}
        </button>
      ) : <span className="text-xs">—</span>,
    },
    {
      // Server-resolved cashier_name first; legacy staff lookup only as fallback.
      key: 'cashier', header: 'Cashier', sortable: true,
      accessor: (o) => cashierNameOf(o, staffNameByUserId),
      render: (o) => {
        const name = cashierNameOf(o, staffNameByUserId);
        // Own-only users can't pivot the list to another cashier (QA req 6).
        return name && o.user_id && !ownOnly ? (
          <button type="button" className="text-xs text-primary hover:underline" title="Filter sales by this cashier"
            onClick={(e) => { e.stopPropagation(); patchFilters({ userId: o.user_id }); }}>
            {name}
          </button>
        ) : <span className="text-xs">{name || '—'}</span>;
      },
    },
    {
      key: 'outlet', header: 'Outlet', accessor: (o) => outletNameById[o.outlet_id] ?? '',
      render: (o) => <span className="text-xs">{outletNameById[o.outlet_id] || '—'}</span>,
    },
    {
      key: 'payment_status', header: 'Payment Status', align: 'center', sortable: true, filterable: true,
      accessor: (o) => o.payment_status,
      filterOptions: PAYMENT_STATUSES.filter((s) => s.value).map((s) => ({ value: s.value, label: s.label })),
      render: (o) => payStatusBadge(o.payment_status),
    },
    {
      key: 'payment_method', header: 'Payment Method', filterable: true,
      accessor: (o) => prettyMethod(o.payment_method),
      render: (o) => <span className="text-xs">{prettyMethod(o.payment_method)}</span>,
    },
    {
      // Hidden by default on the POS-only page (every row is pos_terminal there).
      key: 'source', header: 'Source', filterable: true, defaultHidden: !!fixedSource,
      accessor: (o) => SOURCES.find((s) => s.value === o.source)?.label ?? (o.source || '—'),
      render: (o) => <span className="text-xs">{SOURCES.find((s) => s.value === o.source)?.label ?? (o.source || '—')}</span>,
    },
    {
      key: 'total', header: 'Total', align: 'right', sortable: true, accessor: (o) => o.total_amount ?? 0,
      render: (o) => <span className="font-semibold tabular-nums whitespace-nowrap">{money(o.total_amount, o.currency)}</span>,
    },
    {
      key: 'paid', header: 'Paid', align: 'right', accessor: (o) => o.total_paid ?? 0,
      render: (o) => <span className="tabular-nums whitespace-nowrap">{money(o.total_paid, o.currency)}</span>,
    },
    {
      key: 'due', header: 'Sell Due', align: 'right', accessor: (o) => o.amount_due ?? 0,
      render: (o) => <span className="tabular-nums whitespace-nowrap">{o.amount_due > 0.01 ? money(o.amount_due, o.currency) : '—'}</span>,
    },
    {
      key: 'return', header: 'Sell Return', align: 'right', accessor: (o) => o.return_total ?? 0,
      render: (o) => (o.return_count ?? 0) > 0
        ? <span className="text-red-600 font-medium tabular-nums whitespace-nowrap">{money(o.return_total, o.currency)}</span>
        : <span className="tabular-nums">—</span>,
    },
    {
      key: 'shipping', header: 'Shipping', accessor: (o) => o.metadata?.shipping_status ?? '',
      render: (o) => <span className="text-xs capitalize">{o.metadata?.shipping_status || '—'}</span>,
    },
    {
      key: 'items', header: 'Items', align: 'center',
      accessor: (o) => o.item_count ?? (o.edges?.lines?.length ?? 0),
      render: (o) => <span className="text-xs">{o.item_count ?? (o.edges?.lines?.length ?? 0)}</span>,
    },
  ], [orgSlug, ownOnly, staffNameByUserId, outletNameById, fixedSource, patchFilters]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{effectiveTitle}</h1>
          <p className="text-muted-foreground mt-1">{effectiveSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={isFetching}
          title="Refresh — pulls in sales rung up on another till or just confirmed by treasury"
          className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <SalesFilters state={filterState} onChange={patchFilters} outlets={outlets} staff={staff} fixedSource={fixedSource} hideUserFilter={ownOnly} />

      <DataTable<any>
        columns={columns}
        rows={rows}
        rowKey={(o) => o.id}
        loading={isLoading}
        emptyText="No sales match your filters."
        storageKey={fixedSource ? 'pos-pos-sales' : 'pos-all-sales'}
        renderExpanded={(o) => <OrderLinesPanel order={o} noun="sale" />}
        onRowClick={(o) => setDetailId(o.id)}
        selectable={canBulkVoid}
        selected={selected}
        onSelectedChange={setSelected}
        isRowSelectable={(o) => !BULK_VOID_INELIGIBLE.has(o.status)}
        bulkActions={[{
          key: 'void', label: 'Void', variant: 'destructive',
          icon: <XCircle className="h-3.5 w-3.5" />,
          onClick: (keys) => setBulkVoidKeys(keys),
        }]}
        toolbar={(
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input placeholder="Search by invoice / receipt #..." className="w-full bg-accent/30 border-none rounded-lg py-2 pl-10 pr-4 text-sm"
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); setSelected(new Set()); }} />
          </div>
        )}
        toolbarActions={(
          // PDF opens the branded preview modal (download/print); CSV downloads directly.
          // Both stream from /pos/reports/all-sales-document with the current filters.
          <ReportExportButtons
            report="all-sales-document"
            params={exportParams}
            fileNameBase={`all-sales-${exportStamp}`}
            title="All Sales — Export"
            orientation="landscape"
          />
        )}
        pageSize={pageSize}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); setSelected(new Set()); }}
        page={page}
        totalPages={totalPages}
        onPageChange={goToPage}
        total={total}
      />

      {summary && rows.length > 0 && <SalesSummaryFooter summary={summary} />}

      {detailId && <SellDetailsModal orderId={detailId} orgSlug={orgSlug} onClose={() => setDetailId(null)} />}
      {recordPayOrder && <RecordPaymentModal order={recordPayOrder} onClose={() => setRecordPayOrder(null)} />}
      {customerModal && (
        <CustomerDetailsModal
          customerName={customerModal.name}
          customerPhone={customerModal.phone}
          onClose={() => setCustomerModal(null)}
        />
      )}
      {shippingOrder && <EditShippingModal order={shippingOrder} onClose={() => setShippingOrder(null)} />}
      {paymentsOrder && <ViewPaymentsModal order={paymentsOrder} onClose={() => setPaymentsOrder(null)} />}
      {editLinesOrder && <EditOrderLinesModal order={editLinesOrder} onClose={() => setEditLinesOrder(null)} />}
      {moveDateOrder && <MoveOrderDateModal order={moveDateOrder} onClose={() => setMoveDateOrder(null)} />}
      {editSaleInfoOrder && <EditSaleInfoModal order={editSaleInfoOrder} onClose={() => setEditSaleInfoOrder(null)} />}
      <ConfirmDialog open={!!deleteSaleOrder} onOpenChange={(o) => !o && setDeleteSaleOrder(null)}
        title="Permanently delete this sale?"
        description={`${deleteSaleOrder?.order_number}: if this sale was reported to KRA, it will be reversed (GL/inventory/credit-note) and marked deleted — never removed, since a transmitted tax record can't be destroyed. If it was never reported to KRA, it will be PERMANENTLY DELETED (ledger + records), with only an audit snapshot kept. This cannot be undone.`}
        confirmLabel="Delete permanently" variant="danger" onConfirm={handleDeleteSale} loading={deleteSale.isPending} />
      <ConfirmDialog open={!!putOnAccountOrder} onOpenChange={(o) => !o && setPutOnAccountOrder(null)}
        title="Put balance on account?"
        description={`This books the ${money(putOnAccountOrder?.amount_due ?? 0, putOnAccountOrder?.currency)} still owed on ${putOnAccountOrder?.order_number} to ${putOnAccountOrder?.customer_name || 'the customer'}'s account (treasury AR) and finalizes the sale. The customer's credit limit is enforced.`}
        confirmLabel="Put on account" onConfirm={handlePutOnAccount} loading={closeOnAccount.isPending} />
      {bulkVoidKeys && (
        <BulkVoidReasonDialog
          count={bulkVoidKeys.length}
          onClose={() => setBulkVoidKeys(null)}
          onConfirm={handleBulkVoid}
          loading={bulkVoid.isPending}
        />
      )}
    </div>
  );
}
