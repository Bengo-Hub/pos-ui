'use client';

import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Cost-price display for management roles (REQ-006). Cost is SENSITIVE — customers can see
 * the screen — so values render masked (••••) by default; one eye toggle in the column
 * header reveals/hides the whole column. Shared by the POS terminal cart and Add Sale.
 * Visibility gating (pos.catalog.view_cost) is the caller's job; pos-api only serializes
 * cost_price to permitted callers anyway.
 */

/** Column-header label with the reveal/hide eye toggle. */
export function CostHeaderToggle({ revealed, onToggle, label = 'Cost', className }: {
  revealed: boolean;
  onToggle: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={revealed ? 'Hide cost prices' : 'Show cost prices'}
      className={cn('inline-flex items-center gap-1 uppercase hover:text-foreground transition-colors', className)}
    >
      {label}
      {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
    </button>
  );
}

/** One masked cost value, with an optional margin badge against the selling price. */
export function MaskedCost({ cost, sell, revealed, showMargin = true, className }: {
  cost?: number;
  sell?: number;
  revealed: boolean;
  showMargin?: boolean;
  className?: string;
}) {
  if (typeof cost !== 'number' || cost <= 0) {
    return <span className={cn('text-muted-foreground', className)}>—</span>;
  }
  if (!revealed) {
    return <span className={cn('font-mono text-muted-foreground tracking-widest', className)}>••••</span>;
  }
  const margin = showMargin && typeof sell === 'number' && sell > 0 ? ((sell - cost) / sell) * 100 : null;
  return (
    <span className={cn('font-mono tabular-nums', className)}>
      {cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      {margin != null && (
        <span
          title="Margin %"
          className={cn('ml-1 font-semibold', margin < 0 ? 'text-destructive' : margin < 15 ? 'text-amber-600' : 'text-emerald-600')}
        >
          {margin.toFixed(0)}%
        </span>
      )}
    </span>
  );
}
