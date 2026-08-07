'use client';

// DataTable column definitions for the Tax Report — split out of page.tsx to mirror the
// platform's <page>-columns.tsx convention.

import { formatCurrency } from '@/lib/utils';
import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';
import type { TaxRow } from '@/hooks/useReports';

export function buildTaxReportColumns(currency: string): DataTableColumn<TaxRow>[] {
  return [
    {
      key: 'tax_name',
      header: 'Tax Type',
      primary: true,
      accessor: (r) => r.tax_name,
      render: (r) => <span className="font-medium">{r.tax_name}</span>,
    },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      accessor: (r) => r.rate,
      render: (r) => <span className="text-muted-foreground">{r.rate}%</span>,
    },
    {
      key: 'taxable_amount',
      header: 'Taxable Amount',
      align: 'right',
      accessor: (r) => r.taxable_amount,
      render: (r) => <span>{formatCurrency(r.taxable_amount, currency)}</span>,
    },
    {
      key: 'tax_collected',
      header: 'Tax Collected',
      align: 'right',
      mobileAction: true,
      accessor: (r) => r.tax_collected,
      render: (r) => <span className="font-semibold text-yellow-700">{formatCurrency(r.tax_collected, currency)}</span>,
    },
  ];
}
