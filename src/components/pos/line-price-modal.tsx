'use client';

import { useState } from 'react';
import { Tag, X } from 'lucide-react';
import type { CartItem } from '@/components/pos/terminal/terminal-context';

interface LinePriceModalProps {
  open: boolean;
  item: CartItem | null;
  /** Managers/admins (pos.orders.manage): any price — markdown (discount) or markup.
   *  Everyone else: at/above the preset catalog price only (sell higher, never discount). */
  canDiscount?: boolean;
  onApply: (newPrice: number, reason: string) => void;
  onClose: () => void;
}

/**
 * LinePriceModal — override a single cart line's unit price.
 * The preset catalog price is recorded as the original; markdowns are audited/gated
 * server-side as price.override (manager step-up for non-managers).
 */
export function LinePriceModal({ open, item, canDiscount = false, onApply, onClose }: LinePriceModalProps) {
  const original = item?.originalPrice ?? item?.price ?? 0;
  const [value, setValue] = useState<string>(item ? String(item.price) : '');
  const [reason, setReason] = useState(item?.overrideReason ?? '');

  if (!open || !item) return null;

  const maxPrice = typeof item.maxSellingPrice === 'number' && item.maxSellingPrice > 0 ? item.maxSellingPrice : undefined;
  const newPrice = parseFloat(value);
  const floor = canDiscount ? 0 : original;
  const valid = !isNaN(newPrice) && newPrice >= floor && (maxPrice == null || newPrice <= maxPrice);
  const deltaPct = original > 0 && !isNaN(newPrice) ? ((newPrice - original) / original) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-[56] w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2"><Tag className="h-4 w-4 text-primary" /> Override price</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="text-xs text-muted-foreground">
          {item.name} — preset price <span className="font-semibold text-foreground">KES {original.toLocaleString()}</span>
          {maxPrice != null && <span> · ceiling KES {maxPrice.toLocaleString()}</span>}
        </div>

        <input
          type="number" min={floor} max={maxPrice} autoFocus inputMode="decimal"
          value={value} onChange={(e) => setValue(e.target.value)}
          placeholder="New unit price (KES)"
          className="w-full bg-accent/10 border border-border rounded-lg py-2.5 px-3 text-lg font-bold text-center focus:ring-1 focus:ring-primary outline-none"
        />
        {!canDiscount && !isNaN(newPrice) && newPrice < original && (
          <p className="text-xs text-destructive text-center">
            Only a manager can sell below the preset price — you can only sell at or above it.
          </p>
        )}
        {maxPrice != null && !isNaN(newPrice) && newPrice > maxPrice && (
          <p className="text-xs text-destructive text-center">Price can&apos;t exceed the catalog ceiling.</p>
        )}

        <input
          type="text" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (e.g. damaged, price match)"
          className="w-full bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
        />

        {valid && Math.abs(deltaPct) > 0.04 && (
          <div className="text-xs text-muted-foreground text-center">
            {deltaPct < 0 ? (
              <>Markdown: <span className="font-bold text-amber-600">{Math.abs(deltaPct).toFixed(1)}%</span></>
            ) : (
              <>Markup: <span className="font-bold text-emerald-600">+{deltaPct.toFixed(1)}%</span></>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={() => onApply(original, '')} className="flex-1 px-3 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-accent/10">
            Reset
          </button>
          <button onClick={() => onApply(newPrice, reason)} disabled={!valid}
            className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:bg-primary/90">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
