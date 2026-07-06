'use client';

import { useMemo, useState } from 'react';
import { Loader2, Repeat, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { useFullCatalog, useAddOrderLines, type CatalogItem } from '@/hooks/usePOS';
import { useSetAsideLine } from '@/hooks/useHeldItems';

export interface ReplaceableLine {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

/**
 * ReplaceItemDialog — the "customer changed their mind before serving" flow (still water →
 * sparkling water). One confirm does both halves:
 *  1. the ORIGINAL line is set aside into the parked/upsell pool (removed from this bill,
 *     claimable by any other customer), and
 *  2. the REPLACEMENT is added to the order as a new line (fires to the kitchen normally —
 *     it still has to be made).
 * The two calls are not atomic: if the add fails after the set-aside succeeded, the original is
 * safe in Parked Items and the waiter is told to add the replacement manually.
 */
export function ReplaceItemDialog({
  open,
  onClose,
  orderId,
  line,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  line: ReplaceableLine | null;
  onDone?: () => void;
}) {
  const { data: catalog = [], isLoading } = useFullCatalog();
  const setAside = useSetAsideLine();
  const addLines = useAddOrderLines();

  const [search, setSearch] = useState('');
  const [replacement, setReplacement] = useState<CatalogItem | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [busy, setBusy] = useState(false);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter((c) => c.is_available !== false)
      .filter((c) => c.name.toLowerCase().includes(q) || c.sku.toLowerCase().includes(q))
      .slice(0, 8);
  }, [catalog, search]);

  if (!open || !line) return null;

  const reset = () => {
    setSearch('');
    setReplacement(null);
    setQuantity(1);
  };

  const confirm = async () => {
    if (!replacement) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('Replacing an item needs a connection — try again when back online.');
      return;
    }
    setBusy(true);
    try {
      await setAside.mutateAsync({
        orderId,
        lineId: line.id,
        reason: `replaced_with: ${replacement.name}`,
      });
    } catch (e) {
      setBusy(false);
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Could not set the original item aside.');
      return;
    }
    try {
      const unit = replacement.price ?? 0;
      await addLines.mutateAsync({
        orderId,
        lines: [{
          catalog_item_id: replacement.id,
          sku: replacement.sku,
          name: replacement.name,
          quantity,
          unit_price: unit,
          total_price: unit * quantity,
          tax_code_id: replacement.tax_code_id,
          price_includes_tax: replacement.tax_inclusive,
          tax_rate: replacement.tax_rate,
        }],
      });
      toast.success(`${line.name} parked · ${replacement.name} sent to kitchen.`);
      reset();
      onDone?.();
      onClose();
    } catch {
      // Original already parked (recoverable via Claim) — be explicit, don't pretend atomicity.
      toast.error(
        `${line.name} was parked, but ${replacement.name} was NOT added — add it to the order manually.`,
        { duration: 8000 },
      );
      reset();
      onDone?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    // This dialog is mounted INSIDE other modals (e.g. SplitPaymentModal, whose backdrop closes on
    // click) — stop every click here from bubbling up, or the first click (selecting a search
    // result) would close the parent modal and abort the replace mid-flow. Backdrop click closes
    // only THIS dialog.
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { e.stopPropagation(); reset(); onClose(); }}
    >
      <div
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold flex items-center gap-2">
              <Repeat className="h-4 w-4 text-primary" /> Replace item
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-semibold text-foreground">{line.quantity}× {line.name}</span> goes to
              Parked Items (another customer can claim it); the replacement is fired to the kitchen.
            </p>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center hover:bg-accent" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto min-h-0">
          {replacement ? (
            <div className="rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{replacement.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  KSh {(replacement.price ?? 0).toLocaleString()} · {replacement.sku}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 bg-background border border-border rounded-lg py-1.5 px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/40"
                  aria-label="Quantity"
                />
                <button onClick={() => setReplacement(null)} className="text-xs text-muted-foreground hover:text-foreground underline">
                  change
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search the replacement item…"
                  className="w-full bg-background border border-border rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              {isLoading ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                results.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setReplacement(c); setQuantity(line.quantity || 1); }}
                    className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-accent/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{c.sku}{c.category ? ` · ${c.category}` : ''}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums">KSh {(c.price ?? 0).toLocaleString()}</span>
                  </button>
                ))
              )}
              {!isLoading && search.trim() && results.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No matching items.</p>
              )}
            </>
          )}
        </div>

        <div className="px-4 pb-4 pt-2 border-t border-border flex gap-2">
          <button
            onClick={() => { reset(); onClose(); }}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent/30"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!replacement || busy}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
            Park original & replace
          </button>
        </div>
      </div>
    </div>
  );
}
