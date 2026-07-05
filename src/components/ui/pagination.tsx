'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Pagination — a compact prev / numbered / next pager. Extracted from the inline pager that
 * lived in orders/page.tsx so the All-Sales, POS-only, and Recent-Transactions lists share one
 * implementation. Shows up to 5 numbered buttons centered on the current page.
 */
export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  itemLabel = 'records',
  className,
}: {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className={cn('flex items-center justify-between px-1 py-3', className)}>
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages}
        {typeof total === 'number' ? ` · ${total.toLocaleString()} ${itemLabel}` : ''}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
          return p <= totalPages ? (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={cn(
                'h-8 min-w-8 px-2 rounded-lg text-xs font-semibold transition-all',
                p === page ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent',
              )}
            >
              {p}
            </button>
          ) : null;
        })}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
