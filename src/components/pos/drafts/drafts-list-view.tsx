'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, FileText, ArrowRight, RefreshCw, Trash2, Filter } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { DataTable, type DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';
import { useOrders, useDeleteDraft, useBulkDeleteDrafts, type OrderListFilters } from '@/hooks/usePOS';
import { useStaffList } from '@/hooks/useStaff';
import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { useOwnScope } from '@/lib/rbac/scope';
import { usePermissions, P } from '@/hooks/usePermissions';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PrintReceiptButton } from '@/components/pos/print-receipt-button';
import { DateRangePicker, rangeBound, type DateRange } from '@/components/ui/date-range-picker';
import { money, isBackdatedOrder, orderDisplayDate } from '@/components/pos/sales/sales-shared';
import { cashierNameOf, OrderLinesPanel, skippedSummary } from '@/components/pos/sales/sales-table-shared';
import { toast } from 'sonner';

interface DraftsFilterState {
  customer: string;
  userId: string;
  range: DateRange;
}

/**
 * DraftsListView — the Drafts list on the shared platform DataTable: sortable columns,
 * click-to-expand line items, a permission-gated per-row Actions cell and checkbox
 * row-selection with a bulk "Delete drafts" action. A draft is a POSOrder with status="draft"
 * (saved from the terminal "Park" or Add Sale "Save as Draft"); the list is served by
 * useOrders({ status:'draft' }), so cashiers are already scoped server-side to their own
 * drafts (+ the outlet policy) exactly like the sales list.
 *
 * Row actions:
 *  - Resume → reopens the draft in Add Sale, where payment is taken (existing behavior).
 *  - Print  → the shared PrintReceiptButton (GetReceipt); a draft has no payment, so it prints
 *             a pro-forma / quotation-style document. No new document pipeline.
 *  - Delete → useDeleteDraft (single) / useBulkDeleteDrafts (selection), behind ConfirmDialogs.
 *             RBAC mirrors the server: pos.orders.manage deletes ANY draft; a cashier only
 *             their OWN — ineligible rows aren't selectable and hide the button. The server
 *             enforces the identical boundary (skips report why).
 */
export function DraftsListView({ orgSlug }: { orgSlug: string }) {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';
  const currentUserId = user?.id ?? '';
  const selectedOutlet = useOutletFilterStore((s) => s.selectedOutlet);

  // Own-only cashiers see only their own drafts (server-enforced) and must not filter by cashier.
  const { ownOnly } = useOwnScope();
  const { can, canAny } = usePermissions();
  // Mirrors the server RBAC in DeleteDraft/BulkDeleteDrafts: pos.orders.manage deletes ANY
  // draft; otherwise the caller may delete only a draft they created, and only if they hold
  // an order-write permission.
  const canDeleteAnyDraft = can(P.ORDERS_MANAGE);
  const hasOrderWrite = canAny([P.ORDERS_ADD, P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE]);
  const canDeleteThis = useCallback(
    (o: any) => canDeleteAnyDraft || (!!o.user_id && o.user_id === currentUserId && hasOrderWrite),
    [canDeleteAnyDraft, currentUserId, hasOrderWrite],
  );

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<DraftsFilterState>({
    customer: '', userId: '', range: { from: '', to: '' },
  });
  const [deleteDraft, setDeleteDraft] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteKeys, setBulkDeleteKeys] = useState<string[] | null>(null);

  // Staff list still powers the "Created By" FILTER dropdown; row display uses the
  // server-resolved cashier_name (staff lookup only as fallback for empty values).
  const staffQ = useStaffList(tenantId, selectedOutlet?.id || undefined);
  const staff = ((staffQ.data as any)?.data ?? staffQ.data ?? []) as any[];
  const staffNameByUserId = useMemo(
    () => Object.fromEntries(staff.map((s: any) => [s.user_id, s.name])),
    [staff],
  );

  const del = useDeleteDraft();
  const bulkDel = useBulkDeleteDrafts();

  const filters: OrderListFilters = useMemo(() => ({
    status: 'draft',
    outletId: selectedOutlet?.id ?? 'all',
    from: rangeBound(filterState.range.from, filterState.range.fromTime) || undefined,
    to: rangeBound(filterState.range.to, filterState.range.toTime) || undefined,
    customer: filterState.customer.trim() || undefined,
    userId: filterState.userId || undefined,
    orderNumber: search.trim() || undefined,
    page,
    limit: pageSize,
  }), [selectedOutlet?.id, filterState, search, page, pageSize]);

  const { data, isLoading, refetch, isFetching } = useOrders(filters);
  const rows: any[] = data?.data ?? [];
  const total = data?.meta?.total ?? (data as any)?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Selection is cleared whenever the visible row set changes (filter/page) so the bulk
  // delete never silently includes rows the user can no longer see.
  const patch = (p: Partial<DraftsFilterState>) => {
    setFilterState((s) => ({ ...s, ...p }));
    setPage(1);
    setSelected(new Set());
  };
  const goToPage = useCallback((p: number) => { setPage(p); setSelected(new Set()); }, []);

  const handleDelete = () => {
    if (!deleteDraft) return;
    del.mutate(deleteDraft.id, {
      onSuccess: () => { toast.success(`Deleted ${deleteDraft.order_number}`); setDeleteDraft(null); },
      onError: (e: any) => toast.error(e?.response?.data?.error || 'Could not delete draft'),
    });
  };

  const handleBulkDelete = () => {
    if (!bulkDeleteKeys?.length) return;
    bulkDel.mutate(bulkDeleteKeys, {
      onSuccess: (res) => {
        const skips = skippedSummary(res.skipped);
        if (res.deleted > 0) {
          toast.success(`Deleted ${res.deleted} draft${res.deleted === 1 ? '' : 's'}`, skips ? { description: skips } : undefined);
        } else {
          toast.info('No drafts were deleted', skips ? { description: skips } : undefined);
        }
        setSelected(new Set());
        setBulkDeleteKeys(null);
      },
      onError: (e: any) => toast.error(e?.response?.data?.error || 'Bulk delete failed'),
    });
  };

  const columns = useMemo<DataTableColumn<any>[]>(() => [
    {
      key: 'order', header: 'Order #', primary: true, accessor: (o) => o.order_number,
      render: (o) => <span className="font-mono text-xs font-bold text-primary">{o.order_number}</span>,
    },
    {
      // Server-resolved customer_name (fallback "Walk-in") + contact under it.
      key: 'customer', header: 'Customer', sortable: true,
      accessor: (o) => o.customer_name || 'Walk-in',
      render: (o) => (
        <div>
          <div>{o.customer_name || 'Walk-in'}</div>
          {o.customer_phone && <div className="text-xs text-muted-foreground">{o.customer_phone}</div>}
        </div>
      ),
    },
    {
      key: 'date', header: 'Date / Time', sortable: true, accessor: (o) => o.business_date || o.created_at || '',
      render: (o) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {orderDisplayDate(o)}
          {isBackdatedOrder(o) && (
            <span className="block text-[10px] text-amber-600"
              title={`Backdated sale — actually entered ${new Date(o.created_at).toLocaleString('en-KE')}`}>
              backdated
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'items', header: 'Items', align: 'center',
      accessor: (o) => o.item_count ?? (o.edges?.lines ?? o.lines ?? []).length,
      render: (o) => <span className="text-xs">{o.item_count ?? (o.edges?.lines ?? o.lines ?? []).length}</span>,
    },
    {
      key: 'total', header: 'Total', align: 'right', sortable: true, accessor: (o) => o.total_amount ?? 0,
      render: (o) => <span className="font-semibold tabular-nums whitespace-nowrap">{money(o.total_amount, o.currency)}</span>,
    },
    {
      key: 'cashier', header: 'Created By', sortable: true,
      accessor: (o) => cashierNameOf(o, staffNameByUserId),
      render: (o) => <span className="text-xs">{cashierNameOf(o, staffNameByUserId) || '—'}</span>,
    },
    {
      key: 'actions', header: 'Actions', exportable: false,
      render: (o) => (
        <div className="flex items-center gap-1.5">
          <Link href={`/${orgSlug}/sell/add?order_id=${o.id}`}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-primary/40 text-primary text-xs font-bold hover:bg-primary/5">
            Resume <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          {/* Print a pro-forma/quotation-style document (draft has no payment) — shared receipt flow. */}
          <PrintReceiptButton orderId={o.id} label="Print" variant="outline" size="sm" className="h-8 !px-3 text-xs" />
          {canDeleteThis(o) && (
            <Button variant="outline" size="sm" className="h-8 !px-3 text-xs text-destructive" onClick={() => setDeleteDraft(o)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          )}
        </div>
      ),
    },
  ], [orgSlug, staffNameByUserId, canDeleteThis]);

  const selectCls = 'w-full bg-accent/30 border border-border rounded-lg py-2 px-3 text-sm';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Drafts</h1>
          <p className="text-muted-foreground mt-1">Saved, unpaid sales — resume, print a pro-forma, or delete.</p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          title="Refresh — pulls in drafts parked on another till"
          className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters — the same Card + control styling as the All-Sales filter bar. */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Filter className="h-4 w-4 text-primary" /> Filters</div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="text-[11px] font-semibold text-muted-foreground">Customer
            <input className={selectCls} placeholder="Name or phone" value={filterState.customer}
              onChange={(e) => patch({ customer: e.target.value })} />
          </label>
          <div className="text-[11px] font-semibold text-muted-foreground">Date Range
            <DateRangePicker value={filterState.range} onChange={(range) => patch({ range })} className="mt-0.5" />
          </div>
          {/* Cashier / Created-By filter — managers only (own-only cashiers can't pivot to others). */}
          {!ownOnly && (
            <label className="text-[11px] font-semibold text-muted-foreground">Created By
              <select className={selectCls} value={filterState.userId} onChange={(e) => patch({ userId: e.target.value })}>
                <option value="">All cashiers</option>
                {staff.map((s: any) => <option key={s.id} value={s.user_id}>{s.name}</option>)}
              </select>
            </label>
          )}
        </CardContent>
      </Card>

      <DataTable<any>
        columns={columns}
        rows={rows}
        rowKey={(o) => o.id}
        loading={isLoading}
        emptyText="No drafts match your filters. Save an in-progress sale as a draft from the POS terminal (Park) or Add Sale to resume it later."
        storageKey="pos-drafts"
        renderExpanded={(o) => <OrderLinesPanel order={o} noun="draft" />}
        selectable={hasOrderWrite}
        selected={selected}
        onSelectedChange={setSelected}
        isRowSelectable={canDeleteThis}
        bulkActions={[{
          key: 'delete', label: 'Delete drafts', variant: 'destructive',
          icon: <Trash2 className="h-3.5 w-3.5" />,
          onClick: (keys) => setBulkDeleteKeys(keys),
        }]}
        toolbar={(
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input placeholder="Search by draft / order #..." className="w-full bg-accent/30 border-none rounded-lg py-2 pl-10 pr-4 text-sm"
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); setSelected(new Set()); }} />
          </div>
        )}
        pageSize={pageSize}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); setSelected(new Set()); }}
        page={page}
        totalPages={totalPages}
        onPageChange={goToPage}
        total={total}
      />

      <ConfirmDialog open={!!deleteDraft} onOpenChange={(o) => !o && setDeleteDraft(null)} title="Delete draft?"
        description={`This permanently deletes draft ${deleteDraft?.order_number}. This cannot be undone.`}
        confirmLabel="Delete" variant="danger" onConfirm={handleDelete} />
      <ConfirmDialog open={!!bulkDeleteKeys} onOpenChange={(o) => !o && setBulkDeleteKeys(null)} title="Delete selected drafts?"
        description={`This permanently deletes ${bulkDeleteKeys?.length ?? 0} draft${(bulkDeleteKeys?.length ?? 0) === 1 ? '' : 's'}. Drafts you cannot delete are skipped by the server. This cannot be undone.`}
        confirmLabel={`Delete ${bulkDeleteKeys?.length ?? 0}`} variant="danger" loading={bulkDel.isPending} onConfirm={handleBulkDelete} />
    </div>
  );
}
