'use client';

/**
 * Variant picker: when a catalog item has variants (sizes, colours), tapping it opens this
 * instead of adding directly. Two axes show as a grid (colour rows, size columns) with each
 * cell's own stock, the quickest way to find "Red, M" at a busy till; one or three-plus axes
 * show one row of choices per axis; variants without attributes show as a plain list.
 * Stock is shown, never enforced (manual availability rule). The chosen variant becomes its own
 * cart line through lib/pos/variants.ts.
 */

import { Button } from '@/components/ui/base';
import type { ItemVariant, MenuItem } from '@/components/pos/terminal/terminal-context';
import { axisValues, findVariant, variantAxes, variantLabel } from '@/lib/pos/variants';
import { cn, formatCurrency } from '@/lib/utils';
import { Minus, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePOSSettings } from '@/hooks/usePOSSettings';

interface VariantPickerModalProps {
  open: boolean;
  onClose: () => void;
  item: MenuItem;
  onConfirm: (variant: ItemVariant, quantity: number) => void;
}

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function StockNote({ onHand }: { onHand?: number }) {
  if (onHand == null) return null;
  return (
    <span className={cn('block text-[10px] tabular-nums', onHand > 0 ? 'text-muted-foreground' : 'text-destructive')}>
      {onHand > 0 ? `${onHand} in stock` : 'Out of stock'}
    </span>
  );
}

export function VariantPickerModal({ open, onClose, item, onConfirm }: VariantPickerModalProps) {
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const variants = useMemo(() => item.variants ?? [], [item.variants]);
  const axes = useMemo(() => variantAxes(variants), [variants]);
  const [selectedId, setSelectedId] = useState<string | null>(variants.length === 1 ? variants[0].id : null);
  const [partial, setPartial] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);

  const selected = variants.find((v) => v.id === selectedId) ?? null;
  const current: Record<string, string> = selected?.attributes ?? partial;
  const totalPrice = (selected?.price ?? 0) * quantity;

  if (!open) return null;

  // One row per axis: pick values until they name exactly one variant.
  const pickValue = (axis: string, value: string) => {
    const want = { ...current, [axis]: value };
    const exact = axes.every((a) => want[a]) ? findVariant(variants, want) : undefined;
    const fallback = exact ?? (selected ? variants.find((v) => v.attributes?.[axis] === value) : undefined);
    if (fallback) {
      setSelectedId(fallback.id);
      setPartial({});
    } else {
      setSelectedId(null);
      setPartial(want);
    }
  };

  const grid = axes.length === 2;
  const [rowAxis, colAxis] = axes;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">{item.name}</h3>
            <p className="text-sm text-muted-foreground">
              {selected ? `${variantLabel(selected)}, ${formatCurrency(selected.price, currency)}` : 'Choose a variant'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {variants.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No variants available.</p>
          ) : grid ? (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th className="text-left text-xs font-medium text-muted-foreground">{title(rowAxis)} / {title(colAxis)}</th>
                    {axisValues(variants, colAxis).map((c) => (
                      <th key={c} className="text-center text-xs font-semibold">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {axisValues(variants, rowAxis).map((r) => (
                    <tr key={r}>
                      <th scope="row" className="text-left text-xs font-semibold pr-2 whitespace-nowrap">{r}</th>
                      {axisValues(variants, colAxis).map((c) => {
                        const v = findVariant(variants, { [rowAxis]: r, [colAxis]: c });
                        if (!v) return <td key={c} className="text-center text-muted-foreground/50">-</td>;
                        const isSelected = v.id === selectedId;
                        return (
                          <td key={c}>
                            <button
                              type="button"
                              aria-pressed={isSelected}
                              aria-label={`${variantLabel(v)}, ${formatCurrency(v.price, currency)}`}
                              onClick={() => setSelectedId(v.id)}
                              className={cn(
                                'w-full min-h-[48px] rounded-lg border-2 px-1 py-1 text-center transition-all',
                                isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                              )}
                            >
                              <span className="block text-xs font-semibold tabular-nums">{formatCurrency(v.price, currency)}</span>
                              <StockNote onHand={v.onHand} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : axes.length > 0 ? (
            axes.map((axis) => (
              <div key={axis} className="space-y-1.5">
                <p className="text-sm font-medium">{title(axis)}</p>
                <div role="radiogroup" aria-label={title(axis)} className="flex flex-wrap gap-2">
                  {axisValues(variants, axis).map((value) => {
                    const checked = current[axis] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => pickValue(axis, value)}
                        className={cn(
                          'min-h-[44px] min-w-[44px] rounded-xl border-2 px-3 text-sm font-medium transition-all',
                          checked ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                        )}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div role="radiogroup" aria-label="Variant" className="space-y-1.5">
              {variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={v.id === selectedId}
                  onClick={() => setSelectedId(v.id)}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all min-h-[44px] text-left',
                    v.id === selectedId ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30',
                  )}
                >
                  <span className="text-sm font-medium truncate">{v.name}</span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-mono">{formatCurrency(v.price, currency)}</span>
                    <StockNote onHand={v.onHand} />
                  </span>
                </button>
              ))}
            </div>
          )}
          {selected && !grid && <StockNote onHand={selected.onHand} />}
        </div>

        <div className="border-t border-border p-5 space-y-4">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Decrease quantity"
              className="h-11 w-11 rounded-xl border border-border flex items-center justify-center hover:bg-accent"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="text-lg font-bold w-8 text-center">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              aria-label="Increase quantity"
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
            {selected ? `Add to Order, ${formatCurrency(totalPrice, currency)}` : 'Select a variant'}
          </Button>
        </div>
      </div>
    </div>
  );
}
