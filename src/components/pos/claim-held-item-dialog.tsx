'use client';

import { useMemo, useState } from 'react';
import { HandCoins, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { useOrders } from '@/hooks/usePOS';
import { useClaimHeldItem, type HeldItem } from '@/hooks/useHeldItems';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { formatCurrency } from '@/lib/utils';

/**
 * ClaimHeldItemDialog merges a set-aside (parked) item into an ACTIVE order: the waiter picks any
 * open bill at the outlet — same table, another table, even another waiter's — and the backend
 * appends the item as a real order line (already prepared, so no new kitchen ticket fires).
 */
export function ClaimHeldItemDialog({
  item,
  open,
  onClose,
  onClaimed,
}: {
  item: HeldItem | null;
  open: boolean;
  onClose: () => void;
  onClaimed?: () => void;
}) {
  const [search, setSearch] = useState('');
  // All OPEN orders at the outlet (not just "mine") — a parked item may be wanted at any table.
  const { data: ordersRes, isLoading } = useOrders({ status: 'open', limit: 50 });
  const claim = useClaimHeldItem();
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';

  const orders = useMemo(() => {
    const list = ordersRes?.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (o) =>
        o.order_number.toLowerCase().includes(q) ||
        (o.table_reference ?? '').toLowerCase().includes(q),
    );
  }, [ordersRes, search]);

  if (!open || !item) return null;

  const doClaim = async (orderId: string, orderNumber: string) => {
    try {
      await claim.mutateAsync({ id: item.id, claimedOrderId: orderId });
      toast.success(`${item.name} merged into order ${orderNumber}`);
      onClaimed?.();
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Could not merge the parked item into that order.');
    }
  };

  return (
    // Mounted inside other modals (Parked Items modal / My Bills) — stop clicks from bubbling to
    // parent backdrops that close on click; backdrop click closes only this picker.
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold flex items-center gap-2">
              <HandCoins className="h-4 w-4 text-primary" /> Merge parked item into an order
            </h3>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {item.quantity}× {item.name} · {formatCurrency(item.unit_price, currency)} — pick the bill
              of the customer who wants it.
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center hover:bg-accent" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-2.5 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order number or table…"
              className="w-full bg-background border border-border rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No open orders found — open a table order first, then claim the parked item into it.
            </p>
          ) : (
            orders.map((o) => (
              <button
                key={o.id}
                onClick={() => doClaim(o.id, o.order_number)}
                disabled={claim.isPending}
                className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-accent/40 disabled:opacity-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{o.order_number}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {o.table_reference || 'No table'} · {new Date(o.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums">
                  {o.currency ?? 'KES'} {(o.total_amount ?? 0).toLocaleString()}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
