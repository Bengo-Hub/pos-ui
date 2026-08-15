'use client';

// DataTable column definitions for the Sell → Shipments list — split out of page.tsx to
// mirror the platform's <page>-columns.tsx convention.

import { PrintReceiptButton } from '@/components/pos/print-receipt-button';
import { money, payStatusBadge, isBackdatedOrder, orderDisplayDate } from '@/components/pos/sales/sales-shared';
import { cn } from '@/lib/utils';
import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';

export const STATUS_BADGE: Record<string, string> = {
  ordered: 'bg-blue-500/10 text-blue-600',
  packed: 'bg-amber-500/10 text-amber-600',
  shipped: 'bg-purple-500/10 text-purple-600',
  delivered: 'bg-emerald-500/10 text-emerald-600',
  cancelled: 'bg-red-500/10 text-red-600',
};

export interface ShipmentColumnCallbacks {
  outletNameById: Record<string, string>;
  canEdit: boolean;
  onEditShipping: (order: any) => void;
}

export function buildShipmentColumns(cb: ShipmentColumnCallbacks): DataTableColumn<any>[] {
  return [
    {
      key: 'action', header: 'Action', exportable: false, mobileAction: true,
      render: (o) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {cb.canEdit && (
            <button onClick={() => cb.onEditShipping(o)}
              className="h-8 px-3 rounded-md border border-primary/40 text-primary text-xs font-bold hover:bg-primary/5">
              Edit Shipping
            </button>
          )}
          <PrintReceiptButton orderId={o.id} label="Delivery Note" variant="ghost" size="sm" className="h-8 text-xs" />
        </div>
      ),
    },
    {
      key: 'date', header: 'Date', sortable: true, accessor: (o) => o.business_date || o.created_at,
      render: (o) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {orderDisplayDate(o)}
          {isBackdatedOrder(o) && <span className="block text-[10px] text-amber-600">backdated</span>}
        </span>
      ),
    },
    {
      key: 'invoice', header: 'Invoice No.', primary: true, accessor: (o) => o.order_number,
      render: (o) => <span className="font-mono text-xs font-bold text-primary">{o.order_number}</span>,
    },
    {
      key: 'customer', header: 'Customer', accessor: (o) => o.customer_name || 'Walk-In Customer',
      render: (o) => o.customer_name || 'Walk-In Customer',
    },
    {
      key: 'contact', header: 'Contact', mobileHidden: true, accessor: (o) => o.customer_phone ?? '',
      render: (o) => <span className="text-xs">{o.customer_phone || '—'}</span>,
    },
    {
      key: 'outlet', header: 'Outlet', accessor: (o) => cb.outletNameById[o.outlet_id] ?? '',
      render: (o) => <span className="text-xs">{cb.outletNameById[o.outlet_id] || '—'}</span>,
    },
    {
      key: 'shipping_status', header: 'Shipping Status', filterable: true,
      accessor: (o) => String(o.metadata?.shipping_status ?? ''),
      render: (o) => {
        const status = String(o.metadata?.shipping_status ?? '');
        return (
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold capitalize', STATUS_BADGE[status] ?? 'bg-muted text-muted-foreground')}>
            {status || '—'}
          </span>
        );
      },
    },
    {
      key: 'address', header: 'Address', mobileHidden: true, accessor: (o) => o.metadata?.shipping_address ?? '',
      render: (o) => <span className="text-xs max-w-56 truncate block" title={o.metadata?.shipping_address}>{o.metadata?.shipping_address || '—'}</span>,
    },
    {
      key: 'delivery_person', header: 'Delivery Person', mobileHidden: true, accessor: (o) => o.metadata?.delivery_person ?? '',
      render: (o) => <span className="text-xs">{o.metadata?.delivery_person || '—'}</span>,
    },
    {
      key: 'shipping_amount', header: 'Shipping', align: 'right', accessor: (o) => o.metadata?.shipping_amount ?? 0,
      render: (o) => <span className="tabular-nums">{o.metadata?.shipping_amount ? money(o.metadata.shipping_amount, o.currency) : '—'}</span>,
    },
    {
      key: 'payment_status', header: 'Payment', align: 'center', filterable: true, accessor: (o) => o.payment_status,
      render: (o) => payStatusBadge(o.payment_status),
    },
    {
      key: 'total', header: 'Total', align: 'right', sortable: true, accessor: (o) => o.total_amount ?? 0,
      render: (o) => <span className="font-semibold tabular-nums">{money(o.total_amount, o.currency)}</span>,
    },
  ];
}
