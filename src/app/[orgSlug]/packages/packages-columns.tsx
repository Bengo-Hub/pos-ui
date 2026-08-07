'use client';

// DataTable column definitions for the Service Packages list — split out of page.tsx to mirror
// the platform's <page>-columns.tsx convention.

import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';
import type { ServicePackage } from '@/hooks/usePackages';

export interface PackagesColumnCallbacks {
  deactivatingId: string | null;
  onDeactivate: (id: string, name: string) => void;
}

export function buildPackagesColumns(cb: PackagesColumnCallbacks): DataTableColumn<ServicePackage>[] {
  return [
    {
      key: 'name',
      header: 'Name',
      primary: true,
      sortable: true,
      accessor: (pkg) => pkg.name,
      render: (pkg) => <span className="font-medium">{pkg.name}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      cellClassName: 'max-w-[200px] truncate',
      accessor: (pkg) => pkg.description ?? '',
      render: (pkg) => <span className="text-muted-foreground">{pkg.description ?? '—'}</span>,
    },
    {
      key: 'price',
      header: 'Price (KES)',
      align: 'right',
      sortable: true,
      accessor: (pkg) => pkg.price,
      render: (pkg) => <span className="font-mono">{pkg.price.toLocaleString()}</span>,
    },
    {
      key: 'session_count',
      header: 'Sessions',
      align: 'center',
      accessor: (pkg) => pkg.session_count,
      render: (pkg) => <span>{pkg.session_count}</span>,
    },
    {
      key: 'validity_days',
      header: 'Validity',
      align: 'center',
      accessor: (pkg) => pkg.validity_days ?? 0,
      render: (pkg) => <span className="text-muted-foreground">{pkg.validity_days ? `${pkg.validity_days}d` : '—'}</span>,
    },
    {
      key: 'is_active',
      header: 'Status',
      align: 'center',
      accessor: (pkg) => (pkg.is_active ? 'Active' : 'Inactive'),
      render: (pkg) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
            pkg.is_active
              ? 'bg-green-500/10 text-green-700 border border-green-400/30'
              : 'bg-muted text-muted-foreground border border-border'
          }`}
        >
          {pkg.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      exportable: false,
      mobileAction: true,
      render: (pkg) =>
        pkg.is_active ? (
          <button
            onClick={() => cb.onDeactivate(pkg.id, pkg.name)}
            disabled={cb.deactivatingId === pkg.id}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
          >
            Deactivate
          </button>
        ) : null,
    },
  ];
}
