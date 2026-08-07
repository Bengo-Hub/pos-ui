'use client';

// DataTable column definitions for a Loyalty account's Transactions + Referrals tables — split
// out of page.tsx to mirror the platform's <page>-columns.tsx convention.

import { cn } from '@/lib/utils';
import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';
import type { LoyaltyTransaction, Referral } from '@/hooks/useLoyalty';

function txColor(type: string) {
  if (type === 'earn') return 'text-green-400';
  if (type === 'redeem') return 'text-red-400';
  return 'text-muted-foreground';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function buildLoyaltyTransactionColumns(): DataTableColumn<LoyaltyTransaction>[] {
  return [
    {
      key: 'type_field',
      header: 'Type',
      primary: true,
      accessor: (tx) => tx.type_field,
      render: (tx) => <span className={cn('font-medium capitalize', txColor(tx.type_field))}>{tx.type_field}</span>,
    },
    {
      key: 'points',
      header: 'Points',
      align: 'right',
      sortable: true,
      mobileAction: true,
      accessor: (tx) => tx.points,
      render: (tx) => (
        <span className={cn('font-semibold', tx.points > 0 ? 'text-green-400' : 'text-red-400')}>
          {tx.points > 0 ? '+' : ''}{tx.points}
        </span>
      ),
    },
    {
      key: 'balance_after',
      header: 'Balance After',
      align: 'right',
      accessor: (tx) => tx.balance_after,
      render: (tx) => <span className="text-muted-foreground">{tx.balance_after.toLocaleString()}</span>,
    },
    {
      key: 'created_at',
      header: 'Date',
      sortable: true,
      accessor: (tx) => tx.created_at,
      render: (tx) => <span className="text-muted-foreground">{formatDate(tx.created_at)}</span>,
    },
  ];
}

export function buildReferralColumns(): DataTableColumn<Referral>[] {
  return [
    {
      key: 'referred_phone',
      header: 'Friend',
      primary: true,
      accessor: (r) => r.referred_phone,
      render: (r) => <span>{r.referred_phone}</span>,
    },
    {
      key: 'code',
      header: 'Code',
      accessor: (r) => r.code,
      render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.code}</span>,
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
            'px-2 py-0.5 rounded-full text-xs font-medium capitalize',
            r.status === 'earned'
              ? 'bg-green-500/15 text-green-500'
              : r.status === 'pending'
                ? 'bg-amber-500/15 text-amber-500'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {r.status}
        </span>
      ),
    },
    {
      key: 'bonus_points',
      header: 'Bonus',
      align: 'right',
      accessor: (r) => r.bonus_points,
      render: (r) => <span className="font-semibold text-primary">{r.bonus_points}</span>,
    },
  ];
}
