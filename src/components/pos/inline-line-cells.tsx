'use client';

/**
 * Inline cart-line edit cells (retail/pharmacy terminal + reusable in back-office sale forms).
 *
 * Pricing policy (BOI retail requirement):
 *  - admin/manager (`canDiscount`): edit price/margin/discount freely — below or above the
 *    preset price ("give discount as they see fit"); price recalculates from a margin edit
 *    and vice versa. Server still audits/gates via price.override.
 *  - cashier & everyone else: may only raise the price (sell ABOVE the preset — increasing
 *    margin), never below it. Edits below the preset clamp back to the preset.
 *
 * All cells are display-by-default and switch to a small input on click; Enter/blur commits,
 * Escape cancels.
 */

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { MaskedMargin } from '@/components/pos/cost-price';

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
          'inline-block text-right rounded px-1 -mx-1 hover:bg-primary/10 hover:ring-1 hover:ring-primary/30 cursor-text transition-colors',
          className,
        )}
      >
        {display}
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
 * Emits the clamped new unit price; the caller (terminal-context setLinePrice) re-clamps
 * authoritatively and the server gates markdowns via price.override.
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
 * Margin%-cell — editing recalculates the unit price from cost: price = cost / (1 − margin%).
 * Only rendered for cost-visible roles; edits additionally require `editable` (manager/admin).
 */
export function InlineMarginCell({ cost, sell, revealed, editable, onCommitPrice, className }: {
  cost?: number;
  sell?: number;
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
      title="Edit margin % — price recalculates"
      display={<MaskedMargin cost={cost} sell={sell} revealed={revealed} />}
      initial={margin.toFixed(1)}
      parse={(rawStr) => {
        const m = parseFloat(rawStr.replace('%', ''));
        // ≥100% margin is a division by zero (price = cost/(1−m)); cap just below.
        if (isNaN(m) || m >= 99.9) return null;
        return Math.round((cost! / (1 - m / 100)) * 100) / 100;
      }}
      onCommit={onCommitPrice}
      className={className}
    />
  );
}

/**
 * Per-line discount cell (admin/manager only). Shows the line's current markdown
 * ((preset − price) × qty) and accepts either an absolute KES amount off the LINE total
 * or a percentage (e.g. "5%") off the preset price. Commits by lowering the unit price —
 * the same mechanism the server audits as a price override.
 */
export function InlineDiscountCell({ price, preset, quantity, editable, onCommitPrice, className }: {
  price: number;
  preset: number;
  quantity: number;
  editable: boolean;
  onCommitPrice: (newPrice: number) => void;
  className?: string;
}) {
  const lineDiscount = Math.max(0, (preset - price) * quantity);
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
      initial={lineDiscount > 0.004 ? String(Math.round(lineDiscount * 100) / 100) : ''}
      parse={(rawStr) => {
        const s = rawStr.trim();
        if (!s) return preset; // cleared → back to preset price
        const isPct = s.endsWith('%');
        const v = parseFloat(s.replace('%', ''));
        if (isNaN(v) || v < 0) return null;
        const perUnit = isPct ? (preset * v) / 100 : v / Math.max(1, quantity);
        return Math.max(0, Math.round((preset - perUnit) * 100) / 100);
      }}
      onCommit={onCommitPrice}
      className={className}
    />
  );
}
