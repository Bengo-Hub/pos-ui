'use client';

import { Badge } from '@/components/ui/base';
import { useOrder } from '@/hooks/usePOS';
import { PrintReceiptButton } from '@/components/pos/print-receipt-button';
import { ReprintStationTicketsButton } from '@/components/pos/reprint-station-tickets-button';
import { VoidBillButton } from '@/components/pos/void-bill-button';
import { GenerateVoidCodeButton } from '@/components/pos/generate-void-code-button';
import { GenerateComplimentaryCodeButton } from '@/components/pos/generate-complimentary-code-button';
import { useSetAsideLine } from '@/hooks/useHeldItems';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useParams, useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { buildOrderLineColumns } from './order-line-columns';

export default function OrderDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const { data: order, isLoading, refetch } = useOrder(id);
  const setAside = useSetAsideLine();

  const handleSetAside = async (lineId: string, name: string) => {
    const reason = window.prompt(`Set aside "${name}"? Enter a reason (e.g. wrong order):`, 'wrong order');
    if (reason === null) return;
    try {
      await setAside.mutateAsync({ orderId: id, lineId, reason });
      toast.success(`${name} set aside for resale`);
      refetch();
    } catch {
      toast.error('Could not set aside this item.');
    }
  };

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
  const currency = order.currency ?? 'KES';
  const fmt = (n: number) => formatCurrency(n, currency);
  const lineColumns = buildOrderLineColumns({
    orderId: id,
    orderNumber: order.order_number,
    orderStatus: order.status,
    fmt,
    onSetAside: handleSetAside,
    setAsidePending: setAside.isPending,
    onVoided: () => refetch(),
  });

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
          {['open', 'pending_payment'].includes(order.status) && (
            <button
              onClick={() => {
                const p = new URLSearchParams({ order_id: id, order_total: String(order.total_amount ?? 0), covers: String((order as any).covers_count ?? 1), mode: 'add_to_bill' });
                if (order.table_reference) p.set('table_name', order.table_reference);
                if ((order as any).metadata?.table_id) p.set('table_id', (order as any).metadata.table_id);
                router.push(`/${(params?.orgSlug as string) || ''}/order?${p.toString()}`);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors"
            >
              <Plus className="h-4 w-4" /> Add to Bill
            </button>
          )}
          {order.status !== 'cancelled' && (
            <PrintReceiptButton orderId={id} label={order.status === 'completed' ? 'Print Receipt' : 'Print Bill'} />
          )}
          {order.status !== 'cancelled' && (
            <ReprintStationTicketsButton
              orderNumber={order.order_number}
              tableRef={order.table_reference ? `Table ${order.table_reference}` : ''}
              lines={lines}
            />
          )}
          {/* Manager: generate a one-time code to authorize a remote void (shown to managers only). */}
          <GenerateVoidCodeButton orderId={id} orderNumber={order.order_number} status={order.status} />
          {/* Manager: generate a one-time code to authorize closing this bill as complimentary
              remotely (shown to managers only) — same "manager not around" flow as void. */}
          <GenerateComplimentaryCodeButton orderId={id} orderNumber={order.order_number} status={order.status} />
          {/* Void the bill (post-placement) — permission-gated, with manager approval for cashiers
              (scan card, PIN, or the one-time code the manager shared). */}
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
              <div className="px-2 pb-2">
                <DataTable
                  columns={lineColumns}
                  rows={lines.map((l: any, i: number) => ({ ...l, _rowKey: l.id ?? `line-${i}` }))}
                  rowKey={(l) => l._rowKey}
                  storageKey="order-lines-col-prefs"
                />
              </div>
            ) : (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">No line items on this order.</p>
            )}
          </div>
        </div>

        <aside className="space-y-6 self-start lg:sticky lg:top-6">
          <div className="bg-card rounded-2xl border border-border p-5">
            <h2 className="font-bold text-base mb-4">Summary</h2>
            <div className="space-y-2.5 text-sm">
              {/* pos-api serializes zero-value floats with omitempty — a 0 subtotal/tax/total
                  arrives as a missing field, so every money read must default to 0. */}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono font-semibold">{fmt(order.subtotal ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-mono font-semibold">{fmt(order.tax_total ?? 0)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2.5 mt-1">
                <span className="font-bold">Total</span>
                <span className="font-mono font-bold text-primary text-base">{fmt(order.total_amount ?? 0)}</span>
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
                      {fmt(p.amount ?? 0)}
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
