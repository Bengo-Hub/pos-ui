'use client';

/**
 * MobileCartBar — the sticky "View Cart" pill shown below `lg` while the cashier is browsing the
 * catalog with items already in the cart (terminal-shell hides it whenever the cart is empty or
 * the cart sheet is already open, and hides on lg+ where the cart is a permanent side panel).
 * Completes the `cartOpen`/`setCartOpen` state terminal-context.tsx already scaffolds — see
 * terminal-shell.tsx for how the two panels swap on tap.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronUp, ShoppingCart } from 'lucide-react';
import { useTerminal } from '@/components/pos/terminal/terminal-context';
import { cn } from '@/lib/utils';

export function MobileCartBar() {
  const t = useTerminal();
  const { cart, cartItemCount, total } = t;
  // Brief pulse when a new line lands, so an added item is confirmed without forcing navigation
  // away from the catalog. Tracks cartItemCount (not cart.length) so a quantity bump on an
  // existing line also pulses, not just a brand-new SKU.
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(cartItemCount);
  useEffect(() => {
    if (cartItemCount > prevCount.current) {
      setPulse(true);
      const id = setTimeout(() => setPulse(false), 350);
      prevCount.current = cartItemCount;
      return () => clearTimeout(id);
    }
    prevCount.current = cartItemCount;
  }, [cartItemCount]);

  if (cart.length === 0) return null;

  return (
    <button
      type="button"
      onClick={() => t.setCartOpen(true)}
      className={cn(
        'lg:hidden shrink-0 mx-3 mb-2 flex items-center justify-between gap-3 rounded-2xl bg-primary text-primary-foreground px-4 py-3 shadow-lg transition-transform motion-reduce:transition-none',
        pulse && 'scale-[1.02]',
      )}
      aria-label={`View cart, ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}, total KES ${total.toLocaleString()}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="relative shrink-0">
          <ShoppingCart className="h-5 w-5" />
          <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-card text-primary text-[10px] font-extrabold flex items-center justify-center tabular-nums">
            {cartItemCount}
          </span>
        </span>
        <span className="text-sm font-bold truncate">View Cart</span>
      </span>
      <span className="flex items-center gap-1.5 shrink-0">
        <span className="text-sm font-extrabold tabular-nums">KES {total.toLocaleString()}</span>
        <ChevronUp className="h-4 w-4" />
      </span>
    </button>
  );
}
