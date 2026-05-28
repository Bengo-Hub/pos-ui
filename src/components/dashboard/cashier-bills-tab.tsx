'use client';

import { useOrders, useVoidOrder } from '@/hooks/usePOS';
import { fmt } from './widgets';
import { ClipboardList, Eye, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

export function CashierBillsTab({ orgSlug }: { orgSlug: string }) {
  const { data, isLoading, refetch } = useOrders({ status: 'open,pending_payment', limit: 20 });
  const voidOrder = useVoidOrder();
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const orders = data?.data ?? [];

  const handleVoid = (orderId: string, orderNum: string) => {
    if (!confirm(`Void order ${orderNum}?`)) return;
    setVoidingId(orderId);
    voidOrder.mutate(
      { orderId, reason: 'Voided by cashier' },
      {
        onSuccess: () => { toast.success(`Order ${orderNum} voided`); refetch(); },
        onError: () => toast.error('Failed to void order'),
        onSettled: () => setVoidingId(null),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">No open bills</p>
        <p className="text-xs mt-1">All caught up!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {orders.map((order: any) => {
        const lineCount = order.edges?.lines?.length ?? 0;
        const elapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60_000);
        return (
          <div key={order.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold truncate">#{order.order_number}</p>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                  {order.status?.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {lineCount} item{lineCount !== 1 ? 's' : ''} · {elapsed}min ago
                {order.edges?.tables?.[0]?.name ? ` · Table ${order.edges.tables[0].name}` : ''}
              </p>
            </div>
            <p className="text-sm font-bold shrink-0">{fmt(order.total_amount ?? 0)}</p>
            <div className="flex items-center gap-1 shrink-0">
              <Link
                href={`/${orgSlug}/orders/${order.id}`}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title="View"
              >
                <Eye className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                disabled={voidingId === order.id}
                onClick={() => handleVoid(order.id, order.order_number)}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-red-200 hover:bg-red-50 transition-colors text-red-400 hover:text-red-600 disabled:opacity-40"
                title="Void"
              >
                {voidingId === order.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
