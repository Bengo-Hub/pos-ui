'use client';

import { Badge } from '@/components/ui/base';
import { useOrder } from '@/hooks/usePOS';
import { PrintReceiptButton } from '@/components/pos/print-receipt-button';
import { VoidBillButton } from '@/components/pos/void-bill-button';
import { Loader2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';

export default function OrderDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const { data: order, isLoading, refetch } = useOrder(id);

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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
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
        <div className="flex items-center gap-3 shrink-0">
          {order.status !== 'cancelled' && (
            <PrintReceiptButton orderId={id} label={order.status === 'completed' ? 'Print Receipt' : 'Print Bill'} />
          )}
          {/* Void the bill (post-placement) — permission-gated, with manager approval for cashiers. */}
          <VoidBillButton orderId={id} orderNumber={order.order_number} status={order.status} onVoided={() => refetch()} />
          <button
            onClick={() => router.back()}
            className="text-sm text-primary underline"
          >
            Back
          </button>
        </div>
      </div>

      {/* Two-column on desktop: line items fill the main column, summary + payments ride the side. */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-bold text-base">Line Items</h2>
            </div>
            {lines.length > 0 ? (
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
                        KES {(
                          line.total_price ??
                          line.line_total ??
                          line.total ??
                          (line.unit_price ?? 0) * (line.quantity ?? 0)
                        ).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">No line items on this order.</p>
            )}
          </div>
        </div>

        <aside className="space-y-6 self-start lg:sticky lg:top-6">
          <div className="bg-card rounded-2xl border border-border p-5">
            <h2 className="font-bold text-base mb-4">Summary</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono font-semibold">KES {order.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-mono font-semibold">KES {order.tax_total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2.5 mt-1">
                <span className="font-bold">Total</span>
                <span className="font-mono font-bold text-primary text-base">KES {order.total_amount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {payments.length > 0 && (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-bold text-base">Payments</h2>
              </div>
              <div className="divide-y divide-border">
                {payments.map((p: any, i: number) => (
                  <div key={p.id ?? i} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="capitalize font-medium truncate">{(p.payment_method ?? '').replace(/_/g, ' ') || '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}
                      </p>
                    </div>
                    <span className="font-mono font-semibold text-green-600 shrink-0">
                      KES {(p.amount ?? 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
