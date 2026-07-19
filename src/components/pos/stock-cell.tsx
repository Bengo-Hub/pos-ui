'use client';

import { cn } from '@/lib/utils';

/**
 * StockCell renders the EXPECTED stock balance for a cart/sale line — the on-hand quantity minus
 * the quantity being sold, i.e. what stock will be once this sale is finalized. It re-renders live
 * as the line quantity changes (the value is derived from props, no state).
 *
 * Colour rules (shared by the terminal cart + Add Sale tables, visible to ALL roles):
 *  - not stock-tracked (service, or undefined on-hand) → a muted dash.
 *  - projected balance ≤ 1 (last unit, zero, or oversold-negative) → red (destructive).
 *  - otherwise → muted/neutral.
 *
 * The out-of-stock ("oversell") manager-approval flow is triggered separately at the add/increment
 * site when the projected balance would go below 0 — this component is display-only.
 */
export function StockCell({
  stockQuantity,
  soldQty,
  itemType,
  className,
}: {
  /** Current on-hand quantity for the item (undefined = not stock-tracked). */
  stockQuantity?: number | null;
  /** Quantity of this item on the sale (subtracted from stock for the projected balance). */
  soldQty: number;
  /** Item type — SERVICE items are never stock-tracked. */
  itemType?: string;
  className?: string;
}) {
  const tracked = itemType !== 'SERVICE' && stockQuantity !== undefined && stockQuantity !== null;
  if (!tracked) {
    return <span className={cn('text-muted-foreground/40 tabular-nums', className)} title="Not stock-tracked">—</span>;
  }
  const projected = (stockQuantity as number) - soldQty;
  const critical = projected <= 1; // last unit / out / oversold
  return (
    <span
      className={cn('tabular-nums font-semibold', critical ? 'text-destructive' : 'text-muted-foreground', className)}
      title={`In stock: ${stockQuantity} · after this sale: ${projected}`}
    >
      {projected}
    </span>
  );
}
