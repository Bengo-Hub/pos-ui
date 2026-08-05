'use client';

/**
 * Variant picker — mirrors the ModifierModal look/host. When a catalog item has variants
 * (has_variants / variants[]), tapping it opens this picker instead of adding directly.
 * Selecting a variant calls back with the chosen variant + quantity; the controller then
 * shapes the cart line (variant price/sku/barcode + "<item> — <variant>" name) and either
 * falls through to modifiers or adds straight to the cart.
 */

import { Button } from '@/components/ui/base';
import type { ItemVariant, MenuItem } from '@/components/pos/terminal/terminal-context';
import { cn, formatCurrency } from '@/lib/utils';
import { Check, Minus, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePOSSettings } from '@/hooks/usePOSSettings';

interface VariantPickerModalProps {
  open: boolean;
  onClose: () => void;
  item: MenuItem;
  onConfirm: (variant: ItemVariant, quantity: number) => void;
}

/** Render an attributes map ({color:"Red", size:"M"}) as a compact "Red / M" label. */
function formatAttributes(attributes?: Record<string, string>): string {
  if (!attributes) return '';
  return Object.values(attributes).filter(Boolean).join(' / ');
}

export function VariantPickerModal({ open, onClose, item, onConfirm }: VariantPickerModalProps) {
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const variants = useMemo(() => item.variants ?? [], [item.variants]);
  const [selectedId, setSelectedId] = useState<string | null>(variants.length === 1 ? variants[0].id : null);
  const [quantity, setQuantity] = useState(1);

  const selected = variants.find((v) => v.id === selectedId) ?? null;
  const totalPrice = (selected?.price ?? 0) * quantity;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-2xl border border-border w-full max-w-md max-h-[80vh] flex flex-col shadow-xl">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">{item.name}</h3>
            <p className="text-sm text-muted-foreground">Choose a variant</p>
          </div>
          <button onClick={onClose} className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-1.5">
          {variants.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No variants available.</p>
          ) : (
            variants.map((v) => {
              const isSelected = v.id === selectedId;
              const attrs = formatAttributes(v.attributes);
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all min-h-[44px] text-left',
                    isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{v.name}</p>
                    {attrs && <p className="text-xs text-muted-foreground truncate">{attrs}</p>}
                    {v.barcode && <p className="text-[10px] text-muted-foreground font-mono truncate">{v.barcode}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground font-mono">{formatCurrency(v.price, currency)}</span>
                    {isSelected && <Check className="h-4 w-4 text-primary" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-border p-5 space-y-4">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="h-11 w-11 rounded-xl border border-border flex items-center justify-center hover:bg-accent"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="text-lg font-bold w-8 text-center">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="h-11 w-11 rounded-xl border border-border flex items-center justify-center hover:bg-accent"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <Button
            onClick={() => {
              if (selected) onConfirm(selected, quantity);
            }}
            disabled={!selected}
            className={cn('w-full min-h-[52px] text-base font-bold gap-2', !selected && 'opacity-50 cursor-not-allowed')}
          >
            {selected ? `Add to Order — ${formatCurrency(totalPrice, currency)}` : 'Select a variant'}
          </Button>
        </div>
      </div>
    </div>
  );
}
