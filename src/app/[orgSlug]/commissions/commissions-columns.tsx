'use client';

// DataTable column definitions for the Commissions list — split out of page.tsx to mirror the
// platform's <page>-columns.tsx convention.

import { cn, formatCurrency } from '@/lib/utils';
import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';
import type { CommissionRecord } from '@/hooks/useCommissions';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function buildCommissionsColumns(currency: string): DataTableColumn<CommissionRecord>[] {
  return [
    {
      key: 'staff_member_id',
      header: 'Staff ID',
      primary: true,
      accessor: (r) => r.staff_member_id,
      render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.staff_member_id.slice(0, 8)}…</span>,
    },
    {
      key: 'order_id',
      header: 'Order ID',
      hideBelow: 'md',
      accessor: (r) => r.order_id ?? '',
      render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.order_id ? `${r.order_id.slice(0, 8)}…` : '—'}</span>,
    },
    {
      key: 'service_sku',
      header: 'Service',
      accessor: (r) => r.service_sku ?? '',
      render: (r) => <span className="text-muted-foreground">{r.service_sku || '—'}</span>,
    },
    {
      key: 'sale_amount',
      header: 'Sale Amount',
      align: 'right',
      sortable: true,
      accessor: (r) => r.sale_amount,
      render: (r) => <span>{formatCurrency(r.sale_amount, currency)}</span>,
    },
    {
      key: 'commission_rate',
      header: 'Rate',
      align: 'right',
      accessor: (r) => r.commission_rate ?? 0,
      render: (r) => <span className="text-muted-foreground">{(r.commission_rate ?? 0).toFixed(1)}%</span>,
    },
    {
      key: 'commission_amount',
      header: 'Commission',
      align: 'right',
      sortable: true,
      accessor: (r) => r.commission_amount,
      render: (r) => <span className="font-semibold text-primary">{formatCurrency(r.commission_amount, currency)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      mobileAction: true,
      accessor: (r) => r.status,
      render: (r) => (
        <span
          className={cn(
            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize',
            r.status === 'paid' && 'bg-green-100 text-green-700',
            r.status === 'pending' && 'bg-amber-100 text-amber-700',
            r.status === 'voided' && 'bg-red-100 text-red-700',
          )}
        >
          {r.status}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Date',
      sortable: true,
      accessor: (r) => r.created_at,
      render: (r) => <span className="text-muted-foreground">{formatDate(r.created_at)}</span>,
    },
  ];
}
