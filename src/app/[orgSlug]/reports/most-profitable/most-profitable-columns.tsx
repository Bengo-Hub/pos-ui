'use client';

// DataTable column definitions for the Most Profitable Items report — split out of page.tsx to
// mirror the platform's <page>-columns.tsx convention.

import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';
import type { ProfitableItem } from '@/hooks/useReports';

export function buildMostProfitableColumns(money: (n: number) => string): DataTableColumn<ProfitableItem>[] {
  return [
    {
      key: 'name',
      header: 'Item',
      primary: true,
      accessor: (it) => it.name || it.sku,
      render: (it) => (
        <div>
          <div className="font-medium">{it.name || it.sku}</div>
          <div className="text-xs text-muted-foreground">{it.sku}</div>
        </div>
      ),
    },
    {
      key: 'units_sold',
      header: 'Units Sold',
      align: 'right',
      accessor: (it) => it.units_sold,
      render: (it) => <span>{it.units_sold.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>,
    },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      accessor: (it) => it.revenue,
      render: (it) => <span>{money(it.revenue)}</span>,
    },
    {
      key: 'unit_cost',
      header: 'Unit Cost',
      align: 'right',
      accessor: (it) => it.unit_cost,
      render: (it) => <span className="text-muted-foreground">{money(it.unit_cost)}</span>,
    },
    {
      key: 'profit',
      header: 'Profit',
      align: 'right',
      mobileAction: true,
      accessor: (it) => it.profit,
      render: (it) => <span className="font-semibold text-green-700">{money(it.profit)}</span>,
    },
    {
      key: 'margin_pct',
      header: 'Margin',
      align: 'right',
      accessor: (it) => it.margin_pct,
      render: (it) => <span>{it.margin_pct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</span>,
    },
  ];
}
