'use client';

// DataTable column definitions for the Sell → Import Sales preview + failed-rows tables —
// split out of page.tsx to mirror the platform's <page>-columns.tsx convention.

import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';

export interface GroupedSale {
  external_ref: string;
  date?: string;
  customer_name?: string;
  customer_phone?: string;
  payment_method?: string;
  discount?: number;
  note?: string;
  lines: { catalog_item_id?: string; sku: string; name: string; quantity: number; unit_price: number; matched: boolean }[];
}

export interface ImportResultRow {
  external_ref: string;
  status: string;
  error?: string;
}

export function buildImportPreviewColumns(): DataTableColumn<GroupedSale>[] {
  return [
    {
      key: 'invoice',
      header: 'Invoice',
      primary: true,
      accessor: (s) => s.external_ref,
      render: (s) => <span className="font-mono">{s.external_ref}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      accessor: (s) => s.date ?? '',
      render: (s) => s.date || '—',
    },
    {
      key: 'customer',
      header: 'Customer',
      accessor: (s) => s.customer_name ?? '',
      render: (s) => s.customer_name || 'Walk-In',
    },
    {
      key: 'payment',
      header: 'Payment',
      accessor: (s) => s.payment_method ?? '',
      render: (s) => <span className="capitalize">{s.payment_method || 'due'}</span>,
    },
    {
      key: 'lines',
      header: 'Lines',
      mobileHidden: true,
      render: (s) => <>{s.lines.map((l) => `${l.quantity}× ${l.name}${l.matched ? '' : ' ⚠'}`).join(', ')}</>,
    },
    {
      key: 'total',
      header: 'Total (pre-tax/disc)',
      align: 'right',
      accessor: (s) => s.lines.reduce((t, l) => t + l.quantity * l.unit_price, 0),
      render: (s) => <span className="tabular-nums">{s.lines.reduce((t, l) => t + l.quantity * l.unit_price, 0).toLocaleString()}</span>,
    },
  ];
}

export function buildImportResultColumns(): DataTableColumn<ImportResultRow>[] {
  return [
    {
      key: 'invoice',
      header: 'Invoice',
      primary: true,
      accessor: (r) => r.external_ref,
      render: (r) => <span className="font-mono">{r.external_ref}</span>,
    },
    {
      key: 'error',
      header: 'Error',
      accessor: (r) => r.error ?? '',
      render: (r) => <span className="text-destructive">{r.error}</span>,
    },
  ];
}
