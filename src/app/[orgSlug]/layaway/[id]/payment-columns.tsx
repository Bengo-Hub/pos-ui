'use client';

// DataTable column definitions for a Layaway plan's Payment History — split out of page.tsx
// to mirror the platform's <page>-columns.tsx convention.

import { formatCurrency } from '@/lib/utils';
import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';
import type { LayawayPayment } from '@/hooks/useLayaway';

export function buildLayawayPaymentColumns(currency: string): DataTableColumn<LayawayPayment>[] {
  return [
    {
      key: 'amount',
      header: 'Amount',
      primary: true,
      sortable: true,
      accessor: (p) => p.amount,
      render: (p) => <span className="font-mono font-semibold text-green-600">{formatCurrency(p.amount, currency)}</span>,
    },
    {
      key: 'payment_method',
      header: 'Method',
      filterable: true,
      accessor: (p) => p.payment_method,
      render: (p) => <span className="capitalize">{p.payment_method}</span>,
    },
    {
      key: 'reference',
      header: 'Reference',
      accessor: (p) => p.reference ?? '',
      render: (p) => <span className="text-muted-foreground">{p.reference ?? '—'}</span>,
    },
    {
      key: 'created_at',
      header: 'Date',
      sortable: true,
      accessor: (p) => p.created_at,
      render: (p) => <span className="text-muted-foreground">{new Date(p.created_at).toLocaleString()}</span>,
    },
  ];
}
