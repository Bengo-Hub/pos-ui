'use client';

// DataTable column definitions for the pharmacy cashier Bills queue — split out of page.tsx
// to mirror the platform's <page>-columns.tsx convention.

import Link from 'next/link';
import { Can } from '@/components/auth/can';
import { P } from '@/lib/rbac/permissions';
import { formatCurrency } from '@/lib/utils';
import { CreditCard, Loader2 } from 'lucide-react';
import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';
import type { PharmacyBill } from '@/lib/api/clinical';

export interface BillsColumnCallbacks {
  orgSlug: string;
  currency: string;
  busyId: string | null;
  onCollect: (bill: PharmacyBill) => void;
}

export function buildBillsColumns(cb: BillsColumnCallbacks): DataTableColumn<PharmacyBill>[] {
  return [
    {
      key: 'rx_number',
      header: 'Rx #',
      primary: true,
      accessor: (b) => b.prescription.prescription_number,
      render: (b) => (
        <Link href={`/${cb.orgSlug}/pharmacy/${b.prescription.id}`} className="font-mono text-xs hover:text-primary hover:underline">
          {b.prescription.prescription_number}
        </Link>
      ),
    },
    {
      key: 'patient',
      header: 'Patient',
      sortable: true,
      accessor: (b) => b.prescription.patient_name,
      render: (b) => <span className="font-medium">{b.prescription.patient_name}</span>,
    },
    {
      key: 'prescriber',
      header: 'Prescriber',
      accessor: (b) => b.prescription.prescriber_name ?? '',
      render: (b) => <span className="text-muted-foreground">{b.prescription.prescriber_name || '—'}</span>,
    },
    {
      key: 'items',
      header: 'Items',
      align: 'center',
      accessor: (b) => b.line_count,
      render: (b) => <span className="text-muted-foreground">{b.line_count}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortable: true,
      accessor: (b) => b.order_total ?? b.estimated_total,
      render: (b) => <span className="font-semibold">{formatCurrency(b.order_total ?? b.estimated_total, cb.currency)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      exportable: false,
      mobileAction: true,
      render: (b) => (
        <Can permission={P.PAYMENTS_ADD}>
          <button
            onClick={() => cb.onCollect(b)}
            disabled={cb.busyId === b.prescription.id}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {cb.busyId === b.prescription.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CreditCard className="h-3.5 w-3.5" />
            )}
            Collect Payment
          </button>
        </Can>
      ),
    },
  ];
}
