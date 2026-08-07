'use client';

// DataTable column definitions for the Returns list — split out of page.tsx to mirror the
// platform's <page>-columns.tsx convention.

import { cn } from '@/lib/utils';
import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';

export interface ReturnItem {
  id: string;
  return_number: string;
  original_order_id?: string;
  original_receipt_number?: string;
  customer_name?: string;
  customer_phone?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  refund_amount?: number;
  currency?: string;
  // refund_channel is the backend field (cash|mpesa|bank|cheque|store_credit|offset_invoice);
  // refund_method is kept as a fallback for any legacy serialization.
  refund_channel?: string;
  refund_method?: string;
  created_at: string;
  line_items?: { name: string; qty: number; unit_price: number }[];
}

export const STATUS_CONFIG: Record<ReturnItem['status'], { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'bg-warning/10 text-warning' },
  approved:  { label: 'Approved',  className: 'bg-primary/10 text-primary' },
  completed: { label: 'Completed', className: 'bg-success/10 text-success' },
  rejected:  { label: 'Rejected',  className: 'bg-destructive/10 text-destructive' },
};

export interface ReturnsColumnCallbacks {
  onOpenCustomer: (customer: { name?: string | null; phone: string }) => void;
}

export function buildReturnsColumns(cb: ReturnsColumnCallbacks): DataTableColumn<ReturnItem>[] {
  return [
    {
      key: 'return_number',
      header: 'Return #',
      primary: true,
      sortable: true,
      render: (ret) => (
        <span className="font-mono text-xs font-semibold text-primary underline-offset-2 hover:underline">
          {ret.return_number}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      accessor: (ret) => ret.customer_name ?? ret.customer_phone ?? '',
      render: (ret) =>
        ret.customer_phone ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              cb.onOpenCustomer({ name: ret.customer_name, phone: ret.customer_phone as string });
            }}
            className="text-primary hover:underline"
            title="Open customer profile"
          >
            {ret.customer_name || ret.customer_phone}
          </button>
        ) : (
          <span>{ret.customer_name ?? '—'}</span>
        ),
    },
    {
      key: 'reason',
      header: 'Reason',
      cellClassName: 'max-w-[180px] truncate',
      accessor: (ret) => ret.reason,
      render: (ret) => <span className="text-muted-foreground">{ret.reason}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      mobileAction: true,
      accessor: (ret) => ret.status,
      render: (ret) => {
        const cfg = STATUS_CONFIG[ret.status] ?? { label: ret.status, className: 'bg-muted text-muted-foreground' };
        return (
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border border-transparent', cfg.className)}>
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: 'refund_amount',
      header: 'Refund',
      align: 'right',
      sortable: true,
      accessor: (ret) => ret.refund_amount ?? 0,
      render: (ret) => (
        <span className="font-semibold">
          {ret.refund_amount != null ? `${ret.currency ?? 'KES'} ${ret.refund_amount.toLocaleString()}` : '—'}
        </span>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      accessor: (ret) => (ret.refund_channel ?? ret.refund_method ?? '').replace('_', ' '),
      render: (ret) => (
        <span className="text-muted-foreground text-xs capitalize">
          {(ret.refund_channel ?? ret.refund_method)?.replace('_', ' ') ?? '—'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Date',
      sortable: true,
      accessor: (ret) => ret.created_at,
      render: (ret) => <span className="text-muted-foreground text-xs">{new Date(ret.created_at).toLocaleDateString()}</span>,
    },
  ];
}
