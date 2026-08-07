'use client';

// DataTable column definitions for an Order's Line Items — split out of page.tsx to mirror the
// platform's <page>-columns.tsx convention.

import { PackageOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VoidLineButton } from '@/components/pos/void-line-button';
import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';

export interface OrderLineRow {
  /** Real persisted line id — undefined for a line that can't be acted on (set aside/void). */
  id?: string;
  /** Stable React/DataTable row key — falls back to an index-derived value when `id` is absent. */
  _rowKey: string;
  name?: string;
  item_name?: string;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
  line_total?: number;
  total?: number;
  voided_qty?: number;
}

export interface OrderLineColumnCallbacks {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  fmt: (n: number) => string;
  onSetAside: (lineId: string, name: string) => void;
  setAsidePending: boolean;
  onVoided: () => void;
}

export function buildOrderLineColumns(cb: OrderLineColumnCallbacks): DataTableColumn<OrderLineRow>[] {
  const editable = ['open', 'pending_payment'].includes(cb.orderStatus);
  const isFullyVoided = (l: OrderLineRow) => l.voided_qty != null && l.voided_qty >= (l.quantity ?? 0);
  const isPartiallyVoided = (l: OrderLineRow) => l.voided_qty != null && l.voided_qty < (l.quantity ?? 0);

  const columns: DataTableColumn<OrderLineRow>[] = [
    {
      key: 'name',
      header: 'Item',
      primary: true,
      accessor: (l) => l.name ?? l.item_name ?? 'Item',
      render: (l) => (
        <span className={cn(isFullyVoided(l) && 'text-muted-foreground')}>
          <span className={cn(isFullyVoided(l) && 'line-through')}>{l.name ?? l.item_name ?? 'Item'}</span>
          {isFullyVoided(l) && <span className="ml-2 text-[10px] font-semibold text-destructive">Voided</span>}
          {isPartiallyVoided(l) && <span className="ml-2 text-[10px] font-semibold text-amber-600">−{l.voided_qty} voided</span>}
        </span>
      ),
    },
    {
      key: 'quantity',
      header: 'Qty',
      align: 'center',
      accessor: (l) => l.quantity ?? 0,
      render: (l) => <span>{l.quantity}</span>,
    },
    {
      key: 'unit_price',
      header: 'Unit',
      align: 'right',
      accessor: (l) => l.unit_price ?? 0,
      render: (l) => <span className="font-mono">{cb.fmt(l.unit_price ?? 0)}</span>,
    },
    {
      key: 'total_price',
      header: 'Total',
      align: 'right',
      mobileAction: true,
      accessor: (l) => l.total_price ?? l.line_total ?? l.total ?? (l.unit_price ?? 0) * (l.quantity ?? 0),
      render: (l) => (
        <span className={cn('font-mono font-semibold', isFullyVoided(l) && 'line-through')}>
          {cb.fmt(l.total_price ?? l.line_total ?? l.total ?? (l.unit_price ?? 0) * (l.quantity ?? 0))}
        </span>
      ),
    },
  ];

  if (editable) {
    columns.push({
      key: 'actions',
      header: '',
      align: 'right',
      exportable: false,
      render: (l) =>
        l.id && !l.voided_qty ? (
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => cb.onSetAside(l.id as string, l.name ?? l.item_name ?? 'Item')}
              disabled={cb.setAsidePending}
              title="Set aside for resale (wrong order, already made)"
              className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50"
            >
              <PackageOpen className="h-3.5 w-3.5" /> Set aside
            </button>
            <VoidLineButton
              orderId={cb.orderId}
              orderNumber={cb.orderNumber}
              lineId={l.id}
              name={l.name ?? l.item_name ?? 'Item'}
              quantity={l.quantity ?? 1}
              status={cb.orderStatus}
              voidedQty={l.voided_qty}
              compact
              onVoided={cb.onVoided}
            />
          </div>
        ) : null,
    });
  }

  return columns;
}
