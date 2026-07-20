'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Loader2, FileText, Plus, Minus, ArrowRight, Trash2, Filter } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { useOrders, useDeleteDraft, type OrderListFilters } from '@/hooks/usePOS';
import { useStaffList } from '@/hooks/useStaff';
import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { useOwnScope } from '@/lib/rbac/scope';
import { usePermissions, P } from '@/hooks/usePermissions';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PrintReceiptButton } from '@/components/pos/print-receipt-button';
import { DateRangePicker, rangeBound, type DateRange } from '@/components/ui/date-range-picker';
import { money } from '@/components/pos/sales/sales-shared';
import { toast } from 'sonner';

const PAGE_SIZE = 25;

const th = 'px-4 py-3 font-bold border border-border/60';
const td = 'px-4 py-3 border border-border/40';
const COL_COUNT = 8; // expand + order# + customer + date + items + total + created-by + actions

interface DraftsFilterState {
  customer: string;
  userId: string;
  range: DateRange;
}

/**
 * DraftsListView — the Drafts list rebuilt as a filterable data table that adopts the All-Sales
 * table pattern: the same bordered table shell, the click-to-expand chevron that reveals a draft's
 * line items inline, and a permission-gated per-row Actions cell. A draft is a POSOrder with
 * status="draft" (saved from the terminal "Park" or Add Sale "Save as Draft"); the list is served
 * by useOrders({ status:'draft' }), so cashiers are already scoped server-side to their own drafts
 * (+ the outlet policy) exactly like the sales list.
 *
 * Row actions:
 *  - Resume → reopens the draft in Add Sale, where payment is taken (existing behavior).
 *  - Print  → the shared PrintReceiptButton (GetReceipt); a draft has no payment, so it prints a
 *             pro-forma / quotation-style document. No new document pipeline.
 *  - Delete → useDeleteDraft (DELETE /orders/{id}), behind a ConfirmDialog. RBAC: managers/admins
 *             (pos.orders.manage) delete any draft; a cashier only their OWN — the button is hidden
 *             on drafts they didn't create. The server enforces the identical boundary.
 */
export function DraftsListView({ orgSlug }: { orgSlug: string }) {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';
  const currentUserId = user?.id ?? '';
  const selectedOutlet = useOutletFilterStore((s) => s.selectedOutlet);

  // Own-only cashiers see only their own drafts (server-enforced) and must not filter by cashier.
  const { ownOnly } = useOwnScope();
  const { can, canAny } = usePermissions();
  // Mirrors the server RBAC in DeleteDraft: pos.orders.manage deletes ANY draft; otherwise the
  // caller may delete only a draft they created, and only if they hold an order-write permission.
  const canDeleteAnyDraft = can(P.ORDERS_MANAGE);
  const hasOrderWrite = canAny([P.ORDERS_ADD, P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE]);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<DraftsFilterState>({
    customer: '', userId: '', range: { from: '', to: '' },
  });
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [deleteDraft, setDeleteDraft] = useState<any>(null);

  const staffQ = useStaffList(tenantId, selectedOutlet?.id || undefined);
  const staff = ((staffQ.data as any)?.data ?? staffQ.data ?? []) as any[];
  const staffNameByUserId = useMemo(
    () => Object.fromEntries(staff.map((s: any) => [s.user_id, s.name])),
    [staff],
  );

  const del = useDeleteDraft();

  const filters: OrderListFilters = useMemo(() => ({
    status: 'draft',
    outletId: selectedOutlet?.id ?? 'all',
    from: rangeBound(filterState.range.from, filterState.range.fromTime) || undefined,
    to: rangeBound(filterState.range.to, filterState.range.toTime) || undefined,
    customer: filterState.customer.trim() || undefined,
    userId: filterState.userId || undefined,
    orderNumber: search.trim() || undefined,
    page,
    limit: PAGE_SIZE,
  }), [selectedOutlet?.id, filterState, search, page]);

  const { data, isLoading } = useOrders(filters);
  const rows: any[] = data?.data ?? [];
  const total = data?.meta?.total ?? (data as any)?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const patch = (p: Partial<DraftsFilterState>) => { setFilterState((s) => ({ ...s, ...p })); setPage(1); };
  const toggleExpand = (id: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const handleDelete = () => {
    if (!deleteDraft) return;
    del.mutate(deleteDraft.id, {
      onSuccess: () => { toast.success(`Deleted ${deleteDraft.order_number}`); setDeleteDraft(null); },
      onError: (e: any) => toast.error(e?.response?.data?.error || 'Could not delete draft'),
    });
  };

  const selectCls = 'w-full bg-accent/30 border border-border rounded-lg py-2 px-3 text-sm';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Drafts</h1>
          <p className="text-muted-foreground mt-1">Saved, unpaid sales — resume, print a pro-forma, or delete.</p>
        </div>
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

      <Card>
        <CardHeader className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between py-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input placeholder="Search by draft / order #..." className="w-full bg-accent/30 border-none rounded-lg py-2 pl-10 pr-4 text-sm"
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <span className="text-sm text-muted-foreground">{total} draft{total === 1 ? '' : 's'}</span>
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
                      <th className={`${th} text-left`}>Order #</th>
                      <th className={`${th} text-left`}>Customer</th>
                      <th className={`${th} text-left`}>Date / Time</th>
                      <th className={`${th} text-center`}>Items</th>
                      <th className={`${th} text-right`}>Total</th>
                      <th className={`${th} text-left`}>Created By</th>
                      <th className={`${th} text-left`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((o) => {
                      const isOwn = !!o.user_id && o.user_id === currentUserId;
                      const canDeleteThis = canDeleteAnyDraft || (isOwn && hasOrderWrite);
                      return (
                        <DraftRow key={o.id} draft={o} orgSlug={orgSlug}
                          expanded={expandedRows.has(o.id)} onToggleExpand={() => toggleExpand(o.id)}
                          cashierName={staffNameByUserId[o.user_id]}
                          canDelete={canDeleteThis} onDelete={() => setDeleteDraft(o)} />
                      );
                    })}
                  </tbody>
                </table>
                {rows.length === 0 && (
                  <div className="p-12 text-center text-muted-foreground">
                    No drafts match your filters. Save an in-progress sale as a draft from the POS terminal (Park) or Add Sale to resume it later.
                  </div>
                )}
              </div>
              <div className="px-4"><Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} itemLabel="drafts" /></div>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog open={!!deleteDraft} onOpenChange={(o) => !o && setDeleteDraft(null)} title="Delete draft?"
        description={`This permanently deletes draft ${deleteDraft?.order_number}. This cannot be undone.`}
        confirmLabel="Delete" variant="danger" onConfirm={handleDelete} />
    </div>
  );
}

/** One draft row + its optional expanded line-items panel (All-Sales-style sibling <tr>). */
function DraftRow({ draft: o, orgSlug, expanded, onToggleExpand, cashierName, canDelete, onDelete }: {
  draft: any; orgSlug: string; expanded: boolean; onToggleExpand: () => void;
  cashierName?: string; canDelete: boolean; onDelete: () => void;
}) {
  const lines: any[] = o.edges?.lines ?? o.lines ?? [];
  const itemCount = o.item_count ?? lines.length;
  return (
    <>
      <tr className="hover:bg-accent/5 transition-colors">
        <td className={`${td} text-center`} onClick={onToggleExpand}>
          <button className="h-6 w-6 rounded-md border border-border inline-flex items-center justify-center hover:bg-accent"
            aria-label={expanded ? 'Collapse line items' : 'Expand line items'}>
            {expanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
        </td>
        <td className={`${td} font-mono text-xs font-bold text-primary`}>{o.order_number}</td>
        <td className={td}>{o.customer_name || 'Walk-in Customer'}</td>
        <td className={`${td} text-xs text-muted-foreground`}>{o.created_at ? new Date(o.created_at).toLocaleString('en-KE') : '—'}</td>
        <td className={`${td} text-center text-xs`}>{itemCount}</td>
        <td className={`${td} text-right font-semibold tabular-nums`}>{money(o.total_amount)}</td>
        <td className={`${td} text-xs`}>{cashierName || '—'}</td>
        <td className={td}>
          <div className="flex items-center gap-1.5">
            <Link href={`/${orgSlug}/sell/add?order_id=${o.id}`}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-primary/40 text-primary text-xs font-bold hover:bg-primary/5">
              Resume <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            {/* Print a pro-forma/quotation-style document (draft has no payment) — shared receipt flow. */}
            <PrintReceiptButton orderId={o.id} label="Print" variant="outline" size="sm" className="h-8 !px-3 text-xs" />
            {canDelete && (
              <Button variant="outline" size="sm" className="h-8 !px-3 text-xs text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={COL_COUNT} className="bg-accent/10 px-6 py-3 border border-border/40">
            {lines.length === 0 ? (
              <div className="text-xs text-muted-foreground py-1">No line items on this draft.</div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-muted-foreground uppercase tracking-wider">
                    <th className="text-left py-1.5 px-2 border border-border/40 font-semibold">Item</th>
                    <th className="text-left py-1.5 px-2 border border-border/40 font-semibold">SKU</th>
                    <th className="text-right py-1.5 px-2 border border-border/40 font-semibold">Qty</th>
                    <th className="text-right py-1.5 px-2 border border-border/40 font-semibold">Unit Price</th>
                    <th className="text-right py-1.5 px-2 border border-border/40 font-semibold">Subtotal</th>
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
