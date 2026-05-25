'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useState } from 'react';
import { Loader2, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_name?: string;
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
  total_amount?: number;
  currency?: string;
  expected_date?: string;
  created_at: string;
  line_item_count?: number;
}

const STATUS_CONFIG: Record<PurchaseOrder['status'], { label: string; className: string }> = {
  draft:     { label: 'Draft',     className: 'bg-muted text-muted-foreground' },
  sent:      { label: 'Sent',      className: 'bg-blue-500/10 text-blue-700' },
  partial:   { label: 'Partial',   className: 'bg-amber-500/10 text-amber-700' },
  received:  { label: 'Received',  className: 'bg-emerald-500/10 text-emerald-700' },
  cancelled: { label: 'Cancelled', className: 'bg-red-500/10 text-red-600' },
};

function usePurchaseOrders(status: string) {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  return useQuery({
    queryKey: ['purchase-orders', tenantID, status],
    queryFn: () =>
      apiClient.get<{ data: PurchaseOrder[] }>(
        `/api/v1/${tenantID}/inventory/purchase-orders${status ? `?status=${status}` : ''}`
      ),
    enabled: !!tenantID,
    staleTime: 2 * 60_000,
  });
}

const FILTERS: { key: string; label: string }[] = [
  { key: '',          label: 'All'       },
  { key: 'draft',     label: 'Draft'     },
  { key: 'sent',      label: 'Sent'      },
  { key: 'partial',   label: 'Partial'   },
  { key: 'received',  label: 'Received'  },
  { key: 'cancelled', label: 'Cancelled' },
];

function PurchaseOrdersPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const { data, isLoading } = usePurchaseOrders(statusFilter);
  const orders = data?.data ?? [];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Truck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track supplier orders and stock replenishments</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
              statusFilter === f.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading purchase orders…</span>
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <Truck className="h-10 w-10 opacity-30" />
          <p className="font-medium">No purchase orders found</p>
          <p className="text-xs">Create purchase orders in the Inventory module</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">PO Number</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Supplier</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Items</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Expected</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((po) => {
                const cfg = STATUS_CONFIG[po.status] ?? { label: po.status, className: 'bg-muted text-muted-foreground' };
                return (
                  <tr key={po.id} className="hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold">{po.po_number}</td>
                    <td className="px-4 py-3.5">{po.supplier_name ?? '—'}</td>
                    <td className="px-4 py-3.5">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border border-transparent', cfg.className)}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center text-muted-foreground">{po.line_item_count ?? '—'}</td>
                    <td className="px-4 py-3.5 text-right font-semibold">
                      {po.total_amount != null
                        ? `${po.currency ?? 'KES'} ${po.total_amount.toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground text-xs">
                      {po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground text-xs">
                      {new Date(po.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PurchaseOrdersPageGated() {
  return (
    <ModuleGate moduleKey="purchase_orders" fallback={<ModuleUnavailablePage moduleKey="purchase_orders" />}>
      <PurchaseOrdersPage />
    </ModuleGate>
  );
}
