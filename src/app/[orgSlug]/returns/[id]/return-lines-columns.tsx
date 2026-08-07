'use client';

// DataTable column definitions for a Return's "Returned Items" line list — split out of
// page.tsx to mirror the platform's <page>-columns.tsx convention.

import { formatCurrency } from '@/lib/utils';
import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';

export interface ReturnLine {
  id: string;
  sku?: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  reason?: string;
}

export function buildReturnLineColumns(currency: string): DataTableColumn<ReturnLine>[] {
  return [
    {
      key: 'name',
      header: 'Item',
      primary: true,
      accessor: (l) => l.name,
      render: (l) => <span>{l.name}</span>,
    },
    {
      key: 'sku',
      header: 'SKU',
      accessor: (l) => l.sku ?? '',
      render: (l) => <span className="text-muted-foreground text-xs font-mono">{l.sku ?? '—'}</span>,
    },
    {
      key: 'quantity',
      header: 'Qty',
      align: 'right',
      accessor: (l) => l.quantity,
      render: (l) => <span>{l.quantity}</span>,
    },
    {
      key: 'unit_price',
      header: 'Unit Price',
      align: 'right',
      accessor: (l) => l.unit_price,
      render: (l) => <span>{formatCurrency(l.unit_price, currency)}</span>,
    },
    {
      key: 'total_price',
      header: 'Total',
      align: 'right',
      mobileAction: true,
      accessor: (l) => l.total_price,
      render: (l) => <span className="font-semibold">{formatCurrency(l.total_price, currency)}</span>,
    },
  ];
}
