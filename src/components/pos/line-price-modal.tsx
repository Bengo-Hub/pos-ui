'use client';

import { useState } from 'react';
import { Tag, X } from 'lucide-react';
import type { CartItem } from '@/components/pos/terminal/terminal-context';

interface LinePriceModalProps {
  open: boolean;
  item: CartItem | null;
  onApply: (newPrice: number, reason: string) => void;
  onClose: () => void;
}

/**
 * LinePriceModal — override a single cart line's unit price (markdown only).
 * The original catalog price is the ceiling; a large markdown triggers a manager
 * step-up at checkout (enforced + audited server-side as price.override).
 */
export function LinePriceModal({ open, item, onApply, onClose }: LinePriceModalProps) {
  const original = item?.originalPrice ?? item?.price ?? 0;
  const [value, setValue] = useState<string>(item ? String(item.price) : '');
  const [reason, setReason] = useState(item?.overrideReason ?? '');

  if (!open || !item) return null;

  const newPrice = parseFloat(value);
  const valid = !isNaN(newPrice) && newPrice >= 0 && newPrice <= original;
  const markdownPct = original > 0 && !isNaN(newPrice) ? ((original - newPrice) / original) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-[56] w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2"><Tag className="h-4 w-4 text-primary" /> Override price</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="text-xs text-muted-foreground">
          {item.name} — catalog price <span className="font-semibold text-foreground">KES {original.toLocaleString()}</span>
        </div>

        <input
          type="number" min={0} max={original} autoFocus inputMode="decimal"
          value={value} onChange={(e) => setValue(e.target.value)}
          placeholder="New unit price (KES)"
          className="w-full bg-accent/10 border border-border rounded-lg py-2.5 px-3 text-lg font-bold text-center focus:ring-1 focus:ring-primary outline-none"
        />
        {!isNaN(newPrice) && newPrice > original && (
          <p className="text-xs text-destructive text-center">Price can&apos;t exceed the catalog price.</p>
        )}

        <input
          type="text" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (e.g. damaged, price match)"
          className="w-full bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
        />

        {valid && (
          <div className="text-xs text-muted-foreground text-center">
            Markdown: <span className="font-bold text-amber-600">{markdownPct.toFixed(1)}%</span>
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
