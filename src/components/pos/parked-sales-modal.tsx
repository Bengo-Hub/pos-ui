'use client';

import { Loader2, PauseCircle } from 'lucide-react';

import { useOrders } from '@/hooks/usePOS';

// ParkedSalesModal lists suspended (draft) sales for this tenant so the cashier can resume one and
// take payment. Parking persists the cart as a draft order; resuming opens its payment modal.
export function ParkedSalesModal({ onClose, onResume }: { onClose: () => void; onResume: (order: any) => void }) {
  const { data, isLoading } = useOrders({ status: 'draft', limit: 50 });
  const orders = data?.data ?? [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <PauseCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-base">Parked Sales</h2>
            <p className="text-xs text-muted-foreground">Resume a suspended sale to take payment</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            No parked sales. Park an in-progress sale to free up the register.
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((o: any) => {
              const lineCount = (o.edges?.lines ?? o.lines ?? []).length;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onResume(o)}
                  className="w-full flex items-center justify-between gap-3 rounded-xl border border-border hover:border-primary/50 hover:bg-accent px-4 py-3 text-left transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm font-mono truncate">{o.order_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.created_at ? new Date(o.created_at).toLocaleTimeString() : ''}
                      {lineCount ? ` · ${lineCount} item${lineCount === 1 ? '' : 's'}` : ''}
                    </p>
                  </div>
                  <span className="font-bold text-sm tabular-nums shrink-0">
                    KES {(o.total_amount ?? 0).toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2 mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
