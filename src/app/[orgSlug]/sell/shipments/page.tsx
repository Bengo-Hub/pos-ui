'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Search, Truck } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/base';
import { Pagination } from '@/components/ui/pagination';
import { useOrders, type OrderListFilters } from '@/hooks/usePOS';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { usePermissions, P } from '@/hooks/usePermissions';
import { SellDetailsModal } from '@/components/pos/sell-details-modal';
import { EditShippingModal } from '@/components/pos/sales/edit-shipping-modal';
import { PrintReceiptButton } from '@/components/pos/print-receipt-button';
import { money, payStatusBadge } from '@/components/pos/sales/sales-shared';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

const STATUS_TABS = [
  { value: 'any', label: 'All Shipments' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'packed', label: 'Packed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_BADGE: Record<string, string> = {
  ordered: 'bg-blue-500/10 text-blue-600',
  packed: 'bg-amber-500/10 text-amber-600',
  shipped: 'bg-purple-500/10 text-purple-600',
  delivered: 'bg-emerald-500/10 text-emerald-600',
  cancelled: 'bg-red-500/10 text-red-600',
};

const th = 'px-4 py-3 font-bold border border-border/60 text-left';
const td = 'px-4 py-3 border border-border/40';

/**
 * Sell → Shipments — every sale carrying shipping info (metadata.shipping_status, written
 * by Add Sale's Shipping Details or the All-Sales Edit Shipping action), managed through
 * its fulfillment lifecycle: ordered → packed → shipped → delivered. Reuses the shared
 * orders list API (shipping_status=any base filter), the Edit Shipping modal, and the
 * delivery-note print pipeline — no parallel shipment entity (deliveries dispatched to
 * riders flow through the logistics S2S integration on online orders).
 */
export default function ShipmentsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { canAny } = usePermissions();
  const canEdit = canAny([P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE]);

  const selectedOutlet = useOutletFilterStore((s) => s.selectedOutlet);
  const outlets = useOutletFilterStore((s) => s.outlets);
  const outletNameById = useMemo(() => Object.fromEntries(outlets.map((o) => [o.id, o.name])), [outlets]);

  const [tab, setTab] = useState('any');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [shippingOrder, setShippingOrder] = useState<any>(null);

  const filters: OrderListFilters = useMemo(() => ({
    outletId: selectedOutlet?.id || 'all',
    shippingStatus: tab,
    orderNumber: search.trim() || undefined,
    page,
    limit: PAGE_SIZE,
  }), [selectedOutlet?.id, tab, search, page]);

  const { data, isLoading, isError, refetch } = useOrders(filters);
  const rows: any[] = data?.data ?? [];
  const total = data?.meta?.total ?? (data as any)?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Truck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Shipments</h1>
          <p className="text-sm text-muted-foreground">
            Sales with shipping — track each order from packed to delivered.
          </p>
        </div>
      </div>

      {/* Status tabs (capsule) */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <button key={t.value} onClick={() => { setTab(t.value); setPage(1); }}
            className={cn('px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors',
              tab === t.value ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted')}>
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="py-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input placeholder="Search by invoice #..." className="w-full bg-accent/30 border-none rounded-lg py-2 pl-10 pr-4 text-sm"
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : isError ? (
            <div className="py-12 text-center">
              <p className="text-sm text-destructive">Could not load shipments.</p>
              <button onClick={() => refetch()} className="mt-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Retry</button>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No shipments yet — add Shipping Details on a sale (Add Sale or All Sales → Edit Shipping) and it appears here.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-accent/5 text-xs uppercase tracking-wider text-muted-foreground">
                      <th className={th}>Action</th>
                      <th className={th}>Date</th>
                      <th className={th}>Invoice No.</th>
                      <th className={th}>Customer</th>
                      <th className={th}>Contact</th>
                      <th className={th}>Outlet</th>
                      <th className={th}>Shipping Status</th>
                      <th className={th}>Address</th>
                      <th className={th}>Delivery Person</th>
                      <th className={`${th} text-right`}>Shipping</th>
                      <th className={`${th} text-center`}>Payment</th>
                      <th className={`${th} text-right`}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((o) => {
                      const meta = o.metadata ?? {};
                      const status = String(meta.shipping_status ?? '');
                      return (
                        <tr key={o.id} className="hover:bg-accent/5 transition-colors cursor-pointer" onClick={() => setDetailId(o.id)}>
                          <td className={td} onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5">
                              {canEdit && (
                                <button onClick={() => setShippingOrder(o)}
                                  className="h-8 px-3 rounded-md border border-primary/40 text-primary text-xs font-bold hover:bg-primary/5">
                                  Edit Shipping
                                </button>
                              )}
                              <PrintReceiptButton orderId={o.id} label="Delivery Note" variant="ghost" size="sm" className="h-8 text-xs" />
                            </div>
                          </td>
                          <td className={`${td} text-xs text-muted-foreground`}>{new Date(o.created_at).toLocaleString('en-KE')}</td>
                          <td className={`${td} font-mono text-xs font-bold text-primary`}>{o.order_number}</td>
                          <td className={td}>{o.customer_name || 'Walk-In Customer'}</td>
                          <td className={`${td} text-xs`}>{o.customer_phone || '—'}</td>
                          <td className={`${td} text-xs`}>{outletNameById[o.outlet_id] || '—'}</td>
                          <td className={td}>
                            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold capitalize', STATUS_BADGE[status] ?? 'bg-muted text-muted-foreground')}>
                              {status || '—'}
                            </span>
                          </td>
                          <td className={`${td} text-xs max-w-56 truncate`} title={meta.shipping_address}>{meta.shipping_address || '—'}</td>
                          <td className={`${td} text-xs`}>{meta.delivery_person || '—'}</td>
                          <td className={`${td} text-right tabular-nums`}>{meta.shipping_amount ? money(meta.shipping_amount) : '—'}</td>
                          <td className={`${td} text-center`}>{payStatusBadge(o.payment_status)}</td>
                          <td className={`${td} text-right font-semibold tabular-nums`}>{money(o.total_amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4"><Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} itemLabel="shipments" /></div>
            </>
          )}
        </CardContent>
      </Card>

      {detailId && <SellDetailsModal orderId={detailId} orgSlug={orgSlug} onClose={() => setDetailId(null)} />}
      {shippingOrder && <EditShippingModal order={shippingOrder} onClose={() => setShippingOrder(null)} />}
    </div>
  );
}
