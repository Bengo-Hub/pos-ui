'use client';

// DataTable column definitions for the Staff Credit list — split out of page.tsx to mirror
// the platform's <page>-columns.tsx convention (see treasury-ui's budget-columns.tsx).

import { cn } from '@/lib/utils';
import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';

export interface StaffCreditLink {
  id: string;
  origin: 'layaway' | 'credit_sale';
  principal: number;
  amount_settled: number;
  outstanding: number;
  sync_status: 'pending' | 'synced' | 'failed';
  status: 'active' | 'settled' | 'cancelled';
  created_at: string;
}

export const SYNC_CLS: Record<string, string> = {
  synced: 'bg-success/10 text-success',
  pending: 'bg-warning/10 text-warning',
  failed: 'bg-destructive/10 text-destructive',
};

export function buildStaffCreditColumns(money: (v: number) => string): DataTableColumn<StaffCreditLink>[] {
  return [
    {
      key: 'origin',
      header: 'Origin',
      primary: true,
      sortable: true,
      filterable: true,
      accessor: (r) => r.origin,
      render: (r) => <span className="capitalize">{r.origin.replace('_', ' ')}</span>,
    },
    {
      key: 'principal',
      header: 'Principal',
      align: 'right',
      sortable: true,
      accessor: (r) => r.principal,
      render: (r) => money(r.principal),
    },
    {
      key: 'recovered',
      header: 'Recovered',
      align: 'right',
      sortable: true,
      accessor: (r) => r.amount_settled,
      render: (r) => <span className="text-success">{money(r.amount_settled)}</span>,
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      sortable: true,
      accessor: (r) => r.outstanding,
      render: (r) => <span className="font-semibold">{money(r.outstanding)}</span>,
    },
    {
      key: 'sync_status',
      header: 'Sync',
      filterable: true,
      accessor: (r) => r.sync_status,
      render: (r) => (
        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', SYNC_CLS[r.sync_status] ?? 'bg-muted')}>
          {r.sync_status}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      accessor: (r) => r.status,
      render: (r) => <span className="capitalize text-muted-foreground">{r.status}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      accessor: (r) => r.created_at,
      render: (r) => <span className="text-muted-foreground text-xs">{new Date(r.created_at).toLocaleDateString()}</span>,
    },
  ];
}
