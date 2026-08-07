'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Search, Truck } from 'lucide-react';
import { useOrders, type OrderListFilters } from '@/hooks/usePOS';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { usePermissions, P } from '@/hooks/usePermissions';
import { SellDetailsModal } from '@/components/pos/sell-details-modal';
import { EditShippingModal } from '@/components/pos/sales/edit-shipping-modal';
import { cn } from '@/lib/utils';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { buildShipmentColumns } from './shipments-columns';

const PAGE_SIZE = 25;

const STATUS_TABS = [
  { value: 'any', label: 'All Shipments' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'packed', label: 'Packed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

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

  const columns = useMemo(
    () => buildShipmentColumns({ outletNameById, canEdit, onEditShipping: setShippingOrder }),
    [outletNameById, canEdit],
  );

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

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(o) => o.id}
        loading={isLoading}
        error={isError}
        onRetry={() => refetch()}
        onRowClick={(o) => setDetailId(o.id)}
        storageKey="sell-shipments-col-prefs"
        emptyText="No shipments yet — add Shipping Details on a sale (Add Sale or All Sales → Edit Shipping) and it appears here."
        toolbar={(
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input placeholder="Search by invoice #..." className="w-full bg-accent/30 border-none rounded-lg py-2 pl-10 pr-4 text-sm"
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        )}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        total={total}
        pageSize={PAGE_SIZE}
      />

      {detailId && <SellDetailsModal orderId={detailId} orgSlug={orgSlug} onClose={() => setDetailId(null)} />}
      {shippingOrder && <EditShippingModal order={shippingOrder} onClose={() => setShippingOrder(null)} />}
    </div>
  );
}
