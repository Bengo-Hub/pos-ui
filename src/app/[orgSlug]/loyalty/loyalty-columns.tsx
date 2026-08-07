'use client';

// DataTable column definitions for the Loyalty Accounts list — split out of page.tsx to mirror
// the platform's <page>-columns.tsx convention.

import Link from 'next/link';
import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';
import type { LoyaltyAccount } from '@/hooks/useLoyalty';

export interface LoyaltyColumnCallbacks {
  orgSlug: string;
}

export function buildLoyaltyColumns(cb: LoyaltyColumnCallbacks): DataTableColumn<LoyaltyAccount>[] {
  return [
    {
      key: 'customer_name',
      header: 'Customer',
      primary: true,
      sortable: true,
      accessor: (acc) => acc.customer_name,
      render: (acc) => <span className="font-medium">{acc.customer_name}</span>,
    },
    {
      key: 'customer_phone',
      header: 'Phone',
      accessor: (acc) => acc.customer_phone,
      render: (acc) => <span className="text-muted-foreground">{acc.customer_phone}</span>,
    },
    {
      key: 'points_balance',
      header: 'Balance',
      align: 'right',
      sortable: true,
      accessor: (acc) => acc.points_balance,
      render: (acc) => <span className="font-semibold text-primary">{acc.points_balance.toLocaleString()} pts</span>,
    },
    {
      key: 'lifetime_points',
      header: 'Lifetime',
      align: 'right',
      sortable: true,
      accessor: (acc) => acc.lifetime_points,
      render: (acc) => <span className="text-muted-foreground">{acc.lifetime_points.toLocaleString()} pts</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      exportable: false,
      mobileAction: true,
      render: (acc) => (
        <Link href={`/${cb.orgSlug}/loyalty/${acc.id}`} className="text-xs text-primary hover:underline">
          View
        </Link>
      ),
    },
  ];
}
