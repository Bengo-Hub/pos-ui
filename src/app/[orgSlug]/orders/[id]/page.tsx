'use client';

import { Badge } from '@/components/ui/base';
import { useOrder } from '@/hooks/usePOS';
import { Loader2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';

export default function OrderDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const { data: order, isLoading } = useOrder(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading order…</span>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>Order not found.</p>
        <button onClick={() => router.back()} className="text-sm text-primary underline mt-2">
          Go back
        </button>
      </div>
    );
  }

  const statusVariant = (s: string) =>
    s === 'completed' ? 'success' : s === 'cancelled' ? 'error' : s === 'draft' ? 'warning' : 'default';

  const lines = order.edges?.lines ?? [];
  const payments = order.edges?.payments ?? [];

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono">{order.order_number}</h1>
          <div className="flex items-center gap-3 mt-1.5">
            <Badge variant={statusVariant(order.status)}>{order.status}</Badge>
            <span className="text-sm text-muted-foreground">
              {new Date(order.created_at).toLocaleString()}
            </span>
          </div>
        </div>
        <button
          onClick={() => router.back()}
          className="text-sm text-primary underline shrink-0"
        >
          Back
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Subtotal</p>
            <p className="text-lg font-bold font-mono">KES {order.subtotal.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Tax</p>
            <p className="text-lg font-bold font-mono">{order.tax_total.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total</p>
            <p className="text-lg font-bold font-mono text-primary">KES {order.total_amount.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {lines.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-bold text-base">Line Items</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/20">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Item</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Qty</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Unit</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((line: any, i: number) => (
                <tr key={line.id ?? i}>
                  <td className="px-4 py-3">{line.name ?? line.item_name ?? 'Item'}</td>
                  <td className="px-4 py-3 text-center">{line.quantity}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    KES {(line.unit_price ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    KES {(line.line_total ?? line.total ?? 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payments.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-bold text-base">Payments</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/20">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Method</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Amount</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.map((p: any, i: number) => (
                <tr key={p.id ?? i}>
                  <td className="px-4 py-3 capitalize">{(p.payment_method ?? '').replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-green-600">
                    KES {(p.amount ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
