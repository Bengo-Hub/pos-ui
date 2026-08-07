'use client';

// DataTable column definitions for the Layaway Plans list — split out of page.tsx to mirror
// the platform's <page>-columns.tsx convention (see treasury-ui's budget-columns.tsx).

import { Badge } from '@/components/ui/base';
import { cn, formatCurrency } from '@/lib/utils';
import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';
import type { LayawayPlan } from '@/hooks/useLayaway';

export function statusVariant(status: LayawayPlan['status']): 'default' | 'success' | 'outline' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'outline';
  return 'default';
}

export function buildLayawayColumns(
  currency: string,
  outletNameById: Record<string, string>,
): DataTableColumn<LayawayPlan>[] {
  return [
    {
      key: 'customer_name',
      header: 'Customer',
      primary: true,
      sortable: true,
      accessor: (p) => p.customer_name,
      render: (p) => <span className="font-medium">{p.customer_name}</span>,
    },
    {
      key: 'customer_phone',
      header: 'Phone',
      accessor: (p) => p.customer_phone ?? '',
      render: (p) => <span className="text-muted-foreground">{p.customer_phone ?? '—'}</span>,
    },
    {
      key: 'outlet',
      header: 'Branch',
      filterable: true,
      accessor: (p) => (p.outlet_id && outletNameById[p.outlet_id]) || '',
      render: (p) => <span className="text-muted-foreground">{(p.outlet_id && outletNameById[p.outlet_id]) || '—'}</span>,
    },
    {
      key: 'total_amount',
      header: 'Total',
      align: 'right',
      sortable: true,
      accessor: (p) => p.total_amount,
      render: (p) => <span className="font-mono">{formatCurrency(p.total_amount, currency)}</span>,
    },
    {
      key: 'paid_amount',
      header: 'Paid',
      align: 'right',
      sortable: true,
      accessor: (p) => p.paid_amount,
      render: (p) => <span className="font-mono text-green-600">{p.paid_amount.toLocaleString()}</span>,
    },
    {
      key: 'remaining_amount',
      header: 'Remaining',
      align: 'right',
      sortable: true,
      accessor: (p) => p.remaining_amount,
      render: (p) => <span className="font-mono text-amber-600">{p.remaining_amount.toLocaleString()}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      mobileAction: true,
      accessor: (p) => p.status,
      render: (p) => (
        <Badge variant={statusVariant(p.status)} className={cn(p.status === 'active' && 'bg-blue-500/10 text-blue-600 border-blue-500/20')}>
          {p.status}
        </Badge>
      ),
    },
    {
      key: 'due_date',
      header: 'Due Date',
      sortable: true,
      accessor: (p) => p.due_date ?? '',
      render: (p) => <span className="text-muted-foreground">{p.due_date ? new Date(p.due_date).toLocaleDateString() : '—'}</span>,
    },
  ];
}
