'use client';

/**
 * Inline cart-line edit cells (retail/pharmacy terminal + reusable in back-office sale forms).
 *
 * Pricing policy (BOI retail requirement):
 *  - admin/manager (`canDiscount`): edit price/margin/discount/line-total freely — below or
 *    above the preset price ("give discount as they see fit"). Server audits via price.override.
 *  - cashier & everyone else: may only raise the price (sell ABOVE the preset — increasing
 *    margin), never below it.
 *
 * Value model (why edits don't clobber each other):
 *  - `unitDiscount` (KES/unit) is stored on the cart line and is STICKY.
 *  - base price  = effective price + unitDiscount   (what the margin describes)
 *  - margin edit → recomputes the BASE from cost, then re-applies the stored discount.
 *  - discount edit → keeps the base, changes the discount.
 *  - price / line-total edit → sets the effective price directly, discount value retained.
 *  So setting a margin then a discount keeps both: margin display recomputes from the
 *  effective price, the discount stays at what was entered.
 *
 * All cells show a small pencil when editable (only the permitted roles see it), switch to an
 * input on click; Enter/blur commits, Escape cancels.
 */

import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MaskedMargin } from '@/components/pos/cost-price';

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Base editable numeric cell: shows children (formatted value) until clicked, then an input. */
function InlineEditCell({ display, initial, onCommit, disabled, title, className, inputClassName, parse }: {
  display: React.ReactNode;
  /** Seed value for the input when editing starts. */
  initial: string;
  /** Returns the parsed value, or null to reject/cancel. */
  parse: (raw: string) => number | null;
  onCommit: (value: number) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (disabled) {
    return <span className={cn('inline-block text-right', className)}>{display}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        title={title}
        onClick={() => { setRaw(initial); setEditing(true); }}
        className={cn(
          'group inline-flex items-center justify-end gap-1 text-right rounded px-1 -mx-1 hover:bg-primary/10 hover:ring-1 hover:ring-primary/30 cursor-text transition-colors',
          className,
        )}
      >
        {display}
        {/* Discoverability: editable cells wear a small pencil (permitted roles only reach here). */}
        <Pencil className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50 group-hover:text-primary" aria-hidden />
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    const v = parse(raw);
    if (v != null && Number.isFinite(v)) onCommit(v);
  };

  return (
    <input
      ref={inputRef}
      autoFocus
      inputMode="decimal"
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      className={cn(
        'w-20 text-right text-xs font-mono bg-background border border-primary/50 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary',
        inputClassName,
      )}
    />
  );
}

/**
 * Unit-price cell. `preset` is the catalog price at add time (the floor for non-managers).
 * Emits the clamped new EFFECTIVE unit price; the stored line discount is retained by the
 * caller (terminal-context setLinePrice), and the server gates markdowns via price.override.
 */
export function InlinePriceCell({ price, preset, canDiscount, onCommit, disabled, className }: {
  price: number;
  preset: number;
  canDiscount: boolean;
  onCommit: (newPrice: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const overridden = Math.abs(price - preset) > 0.004;
  return (
    <span className={cn('inline-flex flex-col items-end leading-tight', className)}>
      <InlineEditCell
        disabled={disabled}
        title={canDiscount ? 'Edit unit price (any value — markdown or markup)' : `Edit unit price (minimum KES ${preset.toLocaleString()})`}
        display={
          <span className={cn('text-xs font-mono', overridden ? (price < preset ? 'text-amber-600 font-semibold' : 'text-emerald-600 font-semibold') : 'text-muted-foreground')}>
            {price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        }
        initial={String(price)}
        parse={(rawStr) => {
          const v = parseFloat(rawStr);
          if (isNaN(v) || v < 0) return null;
          return canDiscount ? v : Math.max(v, preset);
        }}
        onCommit={onCommit}
      />
      {overridden && (
        <span className="text-[9px] text-muted-foreground line-through font-mono">{preset.toLocaleString()}</span>
      )}
    </span>
  );
}

/**
 * Margin%-cell — editing recalculates the BASE price from cost (base = cost / (1 − margin%)),
 * then re-applies the line's stored discount so a margin edit never wipes a discount:
 * effective price = base − unitDiscount. The displayed margin derives from the EFFECTIVE
 * price, so it recomputes (rather than "resets") when a discount is layered on.
 */
export function InlineMarginCell({ cost, sell, unitDiscount = 0, revealed, editable, onCommitPrice, className }: {
  cost?: number;
  sell?: number;
  /** The line's stored discount (KES/unit) — re-applied after the margin sets the base. */
  unitDiscount?: number;
  revealed: boolean;
  editable: boolean;
  onCommitPrice: (newPrice: number) => void;
  className?: string;
}) {
  const hasData = typeof cost === 'number' && cost > 0 && typeof sell === 'number' && sell > 0;
  const margin = hasData ? ((sell! - cost!) / sell!) * 100 : 0;
  return (
    <InlineEditCell
      disabled={!editable || !hasData}
      title="Edit margin % — recalculates the price, keeping any line discount"
      display={<MaskedMargin cost={cost} sell={sell} revealed={revealed} />}
      initial={margin.toFixed(1)}
      parse={(rawStr) => {
        const m = parseFloat(rawStr.replace('%', ''));
        // ≥100% margin is a division by zero (base = cost/(1−m)); cap just below.
        if (isNaN(m) || m >= 99.9) return null;
        const base = cost! / (1 - m / 100);
        return Math.max(0, round2(base - unitDiscount));
      }}
      onCommit={onCommitPrice}
      className={className}
    />
  );
}

/**
 * Per-line discount cell (admin/manager only). Shows the line's STORED discount
 * (unitDiscount × qty) and accepts either an absolute KES amount off the LINE total or a
 * percentage (e.g. "5%") of the base price. Commits the new per-unit discount — the caller
 * (terminal-context setLineDiscount) keeps the base and lowers the effective price, so the
 * value survives later margin/price edits. Clear the input to remove the discount.
 */
export function InlineDiscountCell({ price, unitDiscount = 0, quantity, editable, onCommitDiscount, className }: {
  /** Current EFFECTIVE unit price (after discount). */
  price: number;
  unitDiscount?: number;
  quantity: number;
  editable: boolean;
  onCommitDiscount: (newUnitDiscount: number) => void;
  className?: string;
}) {
  const lineDiscount = unitDiscount * quantity;
  const base = price + unitDiscount;
  return (
    <InlineEditCell
      disabled={!editable}
      title='Line discount — KES off this line, or "5%" off the price'
      display={
        lineDiscount > 0.004 ? (
          <span className="text-xs font-mono font-semibold text-amber-600">
            −{lineDiscount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      }
      initial={lineDiscount > 0.004 ? String(round2(lineDiscount)) : ''}
      parse={(rawStr) => {
        const s = rawStr.trim();
        if (!s) return 0; // cleared → discount removed, price returns to the base
        const isPct = s.endsWith('%');
        const v = parseFloat(s.replace('%', ''));
        if (isNaN(v) || v < 0) return null;
        return round2(isPct ? (base * v) / 100 : v / Math.max(1, quantity));
      }}
      onCommit={onCommitDiscount}
      className={className}
    />
  );
}

/**
 * Line-total (subtotal) cell — editing sets the line's EFFECTIVE total; the unit price becomes
 * total ÷ qty (role-clamped by the caller) and any stored discount value is retained.
 */
export function InlineTotalCell({ price, quantity, canDiscount, onCommitPrice, disabled, className }: {
  price: number;
  quantity: number;
  canDiscount: boolean;
  onCommitPrice: (newUnitPrice: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const total = price * quantity;
  return (
    <InlineEditCell
      disabled={disabled}
      title={canDiscount ? 'Edit line total (unit price = total ÷ qty)' : 'Edit line total (cannot go below the preset price)'}
      display={<span className="text-sm font-bold font-mono tabular-nums">{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}
      initial={String(round2(total))}
      parse={(rawStr) => {
        const v = parseFloat(rawStr);
        if (isNaN(v) || v < 0) return null;
        return round2(v / Math.max(1, quantity));
      }}
      onCommit={onCommitPrice}
      className={className}
    />
  );
}
