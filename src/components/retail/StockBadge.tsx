'use client';

import { cn } from '@/lib/utils';

interface StockBadgeProps {
  quantity: number;
  threshold?: number;
  className?: string;
}

export function StockBadge({ quantity, threshold = 5, className }: StockBadgeProps) {
  if (quantity === 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
          className,
        )}
      >
        Out of Stock
      </span>
    );
  }

  if (quantity <= threshold) {
    return (
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
          className,
        )}
      >
        Low Stock ({quantity})
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        className,
      )}
    >
      In Stock ({quantity})
    </span>
  );
}
