'use client';

// DataTable column definitions for a conference event's meal-card Reconciliation table — shared
// by the Conferences list panel and the event detail page — split out to mirror the platform's
// <page>-columns.tsx convention.

import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';
import type { ReconciliationRow } from '@/lib/api/hotel';

export function buildReconciliationColumns(): DataTableColumn<ReconciliationRow>[] {
  return [
    {
      key: 'conference_day',
      header: 'Day',
      primary: true,
      accessor: (r) => r.conference_day,
      render: (r) => <span>{r.conference_day}</span>,
    },
    {
      key: 'meal_period',
      header: 'Meal',
      accessor: (r) => r.meal_period,
      render: (r) => <span className="capitalize">{r.meal_period.replace('_', ' ')}</span>,
    },
    {
      key: 'issued',
      header: 'Issued',
      align: 'right',
      accessor: (r) => r.issued,
      render: (r) => <span>{r.issued}</span>,
    },
    {
      key: 'redeemed',
      header: 'Redeemed',
      align: 'right',
      mobileAction: true,
      accessor: (r) => r.redeemed,
      render: (r) => <span>{r.redeemed}</span>,
    },
  ];
}
