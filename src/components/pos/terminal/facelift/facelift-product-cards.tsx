'use client';

/**
 * FaceliftProductCards — the CENTER product grid of the hospitality/QSR facelift.
 *
 * Reference layout: image, name, an S|M|L segmented size selector and an Add button that toggles to
 * an "Added" state. Behaviour-preserving:
 *  - The size selector is shown ONLY for items that actually have variants (it maps to the item's
 *    variants, falling back to S/M/L labels). Picking a size + Add adds the matching variant via the
 *    existing handleVariantChosen flow — no new logic.
 *  - Items without variants use the existing handleItemTap flow (modifiers / serial / age-gate / OOS
 *    manager override all still apply, since handleItemTap is the single entry point).
 *  - "Added" is derived from the cart (same source the shared grid uses for its qty badge).
 */

import { useState } from 'react';
import { useTerminal, type MenuItem } from '@/components/pos/terminal/terminal-context';
import { cn } from '@/lib/utils';
import { Check, Image as ImageIcon, Loader2, Plus, Search } from 'lucide-react';

export function FaceliftProductCards() {
  const t = useTerminal();
  const { cart, filteredItems, menuLoading, searchQuery } = t;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto min-h-0 px-1 pb-4">
        {menuLoading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading menu…</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
            <Search className="h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">No items found</p>
            {searchQuery && (
              <button onClick={() => t.handleSearchChange('')} className="text-xs text-primary underline">
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredItems.map((item) => {
              const inCart = cart.find((c) => c.id === item.id && !c.selectedModifiers);
              return <ProductCard key={item.id} item={item} added={!!inCart} qty={inCart?.quantity ?? 0} />;
            })}
          </div>
        )}
      </div>

      {/* Pagination — preserved */}
      {t.totalPages > 1 && (
        <div className="shrink-0 px-1 py-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {((t.page - 1) * t.PAGE_SIZE) + 1}–{Math.min(t.page * t.PAGE_SIZE, t.totalItems)} of {t.totalItems}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => t.setPage((p) => Math.max(1, p - 1))}
              disabled={t.page === 1}
              className="h-8 px-3 rounded-lg border border-border text-xs font-semibold disabled:opacity-40 hover:bg-accent transition-colors"
            >
              ← Prev
            </button>
            <span className="text-xs font-bold px-2">{t.page} / {t.totalPages}</span>
            <button
              onClick={() => t.setPage((p) => Math.min(t.totalPages, p + 1))}
              disabled={t.page === t.totalPages}
              className="h-8 px-3 rounded-lg border border-border text-xs font-semibold disabled:opacity-40 hover:bg-accent transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductCard({ item, added, qty }: { item: MenuItem; added: boolean; qty: number }) {
  const t = useTerminal();
  const variants = item.variants ?? [];
  const hasVariants = !!item.hasVariants || variants.length > 0;
  // Default-select the first variant so a single Add tap is enough (size acts as a quick selector).
  const [variantIdx, setVariantIdx] = useState(0);

  // Up to 3 size chips (S|M|L style). Reference shows 3 — we slice to keep the segmented control tidy.
  const sizeChips = variants.slice(0, 3);
  const fallbackLabel = ['S', 'M', 'L'];
  const displayPrice = hasVariants && sizeChips[variantIdx] ? sizeChips[variantIdx].price : item.price;

  function add() {
    if (hasVariants && sizeChips[variantIdx]) {
      // Reuse the existing variant flow (handles modifiers afterwards if the item has them).
      t.handleVariantChosen(item, sizeChips[variantIdx], 1);
      return;
    }
    // No variants → the single entry point (modifiers / serial / age / OOS override all preserved).
    t.handleItemTap(item);
  }

  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border bg-card overflow-hidden transition-all',
        added ? 'border-primary shadow-md shadow-primary/10' : 'border-border hover:border-primary/40 hover:shadow-md',
      )}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] bg-muted flex items-center justify-center">
        {item.image ? (
          <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-9 w-9 text-muted-foreground/25" />
        )}
        <span className="absolute top-2 left-2 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
        {added && qty > 0 && (
          <span className="absolute top-2 right-2 h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow">
            {qty}
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2">
        <p className="text-sm font-bold leading-tight line-clamp-2 min-h-[2.5em]">{item.name}</p>

        {/* S|M|L segmented size selector — only when the item has variants */}
        {hasVariants && sizeChips.length > 0 && (
          <div className="flex gap-0.5 rounded-lg border border-border p-0.5 bg-background">
            {sizeChips.map((v, i) => (
              <button
                key={v.id}
                onClick={() => setVariantIdx(i)}
                title={v.name}
                className={cn(
                  'flex-1 px-1 py-1 rounded-md text-[11px] font-bold transition-colors truncate',
                  variantIdx === i ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v.name.length <= 3 ? v.name : (fallbackLabel[i] ?? v.name.slice(0, 3))}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mt-auto">
          <span className="text-sm font-extrabold font-mono text-primary">
            KES {displayPrice.toLocaleString()}
          </span>
          <button
            onClick={add}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-all active:scale-95',
              added ? 'bg-emerald-500/12 text-emerald-600' : 'bg-primary text-primary-foreground hover:brightness-95',
            )}
          >
            {added ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {added ? 'Added' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
