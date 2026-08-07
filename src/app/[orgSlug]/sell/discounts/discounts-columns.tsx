'use client';

// DataTable column definitions for the Sell → Discounts list — split out of page.tsx to
// mirror the platform's <page>-columns.tsx convention.

import { Pencil, Ticket, Trash2, Zap, Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';
import type { Discount } from '@/lib/api/discounts';
import { describeDiscount, describeScope } from '@/components/pos/discounts/discount-form-modal';

export const KIND_META: Record<string, { label: string; icon: typeof Ticket; cls: string }> = {
  code: { label: 'Promo Code', icon: Ticket, cls: 'bg-blue-500/10 text-blue-600' },
  auto: { label: 'Automatic', icon: Zap, cls: 'bg-amber-500/10 text-amber-600' },
  happy_hour: { label: 'Time Window', icon: Clock3, cls: 'bg-purple-500/10 text-purple-600' },
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function scheduleText(d: Discount): string {
  if (d.promo_kind === 'happy_hour') {
    if (d.start_at && !d.days_of_week?.length) {
      const from = new Date(d.start_at).toLocaleString('en-KE');
      const to = d.end_at ? new Date(d.end_at).toLocaleString('en-KE') : '—';
      return `${from} → ${to}`;
    }
    const days = (d.days_of_week ?? []).map((v) => DAY_LABELS[v]).join(', ') || 'Daily';
    return `${days} · ${d.window_start || '—'}–${d.window_end || '—'}`;
  }
  const from = d.start_at ? new Date(d.start_at).toLocaleDateString('en-KE') : null;
  const to = d.end_at ? new Date(d.end_at).toLocaleDateString('en-KE') : null;
  if (from && to) return `${from} → ${to}`;
  if (to) return `until ${to}`;
  return 'Always';
}

export interface DiscountColumnCallbacks {
  currency: string;
  outletNameById: Map<string, string>;
  canManage: boolean;
  canDeactivate: boolean;
  onEdit: (d: Discount) => void;
  onDeactivate: (d: Discount) => void;
}

export function buildDiscountColumns(cb: DiscountColumnCallbacks): DataTableColumn<Discount>[] {
  const cols: DataTableColumn<Discount>[] = [
    {
      key: 'name',
      header: 'Name',
      primary: true,
      sortable: true,
      accessor: (d) => d.name,
      render: (d) => <span className="font-medium">{d.name}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      filterable: true,
      accessor: (d) => (KIND_META[d.promo_kind] ?? KIND_META.code).label,
      render: (d) => {
        const meta = KIND_META[d.promo_kind] ?? KIND_META.code;
        const KindIcon = meta.icon;
        return (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', meta.cls)}>
            <KindIcon className="h-3 w-3" /> {meta.label}
          </span>
        );
      },
    },
    {
      key: 'code',
      header: 'Code',
      accessor: (d) => (d.promo_kind === 'code' ? d.promo_code || '' : ''),
      render: (d) => <span className="font-mono text-xs">{d.promo_kind === 'code' ? (d.promo_code || '—') : '—'}</span>,
    },
    {
      key: 'deal',
      header: 'Deal',
      mobileHidden: true,
      render: (d) => <span>{describeDiscount(d, cb.currency)}</span>,
    },
    {
      key: 'scope',
      header: 'Scope',
      mobileHidden: true,
      render: (d) => <span className="text-xs text-muted-foreground">{describeScope(d)}</span>,
    },
    {
      key: 'outlet',
      header: 'Outlet',
      accessor: (d) => (d.outlet_id ? (cb.outletNameById.get(d.outlet_id) ?? 'This outlet') : 'All outlets'),
      render: (d) => (
        <span className="text-xs text-muted-foreground">
          {d.outlet_id ? (cb.outletNameById.get(d.outlet_id) ?? 'This outlet') : 'All outlets'}
        </span>
      ),
    },
    {
      key: 'schedule',
      header: 'Schedule / Validity',
      mobileHidden: true,
      accessor: (d) => scheduleText(d),
      render: (d) => <span className="text-xs text-muted-foreground">{scheduleText(d)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      filterable: true,
      accessor: (d) => d.status,
      render: (d) => (
        <span className={cn('text-xs px-2 py-1 rounded-full font-medium',
          d.status === 'active' ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground')}>
          {d.status}
        </span>
      ),
    },
  ];

  if (cb.canManage) {
    cols.push({
      key: 'actions',
      header: 'Actions',
      align: 'right',
      exportable: false,
      mobileAction: true,
      render: (d) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button title="Edit" onClick={() => cb.onEdit(d)}
            className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent">
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          {cb.canDeactivate && d.status === 'active' && (
            <button title="Deactivate" onClick={() => cb.onDeactivate(d)}
              className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </button>
          )}
        </div>
      ),
    });
  }

  return cols;
}
