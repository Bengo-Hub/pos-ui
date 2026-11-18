'use client';

import { cn } from '@/lib/utils';
import { isStockTracked } from '@/components/pos/stock-cell';

interface StockBadgeProps {
  quantity: number;
  threshold?: number;
  className?: string;
  itemType?: string;
}

export function StockBadge({ quantity, threshold = 5, className, itemType }: StockBadgeProps) {
  // Items that hold no stock of their own never read "Out of Stock" (KRA review 2026-11-11: menu
  // recipes showed out of stock). A recipe's availability comes from its ingredients and a voucher
  // is intangible, so they show no badge; same rule as the cart's StockCell (isStockTracked).
  if (itemType && itemType.toUpperCase() !== 'SERVICE' && !isStockTracked(itemType)) {
    return null;
  }
  // Services are non-depletable — stock tracking does not apply
  if (itemType === 'SERVICE') {
    return (
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
          className,
        )}
      >
        Service
      </span>
    );
  }

  if (quantity <= 0) {
    // A negative quantity is a genuine, persisted backorder debt (an approved oversell not yet
    // settled by a restock) — still "Out of Stock" (not "Low Stock", which the old `=== 0` check
    // let a negative value fall through to), but shown so staff can see how far in the hole the
    // item actually is.
    return (
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
          className,
        )}
      >
        {quantity < 0 ? `Out of Stock (${quantity} backordered)` : 'Out of Stock'}
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
