'use client';

/**
 * Terminal product grid — the catalog browsing area (list / image-grid / card display modes) plus
 * pagination. Extracted verbatim from the monolith order page; reads everything from useTerminal().
 */

import { StockBadge } from '@/components/retail/StockBadge';
import { useTerminal } from '@/components/pos/terminal/terminal-context';
import { cn } from '@/lib/utils';
import { Image as ImageIcon, Loader2, Plus, Search } from 'lucide-react';

export function TerminalProductGrid() {
  const t = useTerminal();
  const { cfg, cart, filteredItems, displayMode, handleItemTap, menuLoading, searchQuery } = t;

  return (
    <>
      {/* Items area — scrolls internally (extra bottom padding clears the mobile cart bar) */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-24 lg:pb-4">
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
        ) : displayMode === 'list' ? (
          /* ─── LIST / DATATABLE MODE ─── */
          <div className="rounded-2xl border border-border overflow-hidden bg-card">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 bg-muted/50 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Item</span>
              <span className="text-right w-24">Price</span>
              <span className="w-6" />
            </div>
            {filteredItems.map((item, idx) => {
              const inCart = cart.find((c) => c.id === item.id && !c.selectedModifiers);
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemTap(item)}
                  className={cn(
                    'w-full grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-3 transition-all touch-manipulation active:scale-[0.99]',
                    idx !== 0 && 'border-t border-border',
                    inCart
                      ? 'bg-primary/5 hover:bg-primary/8'
                      : 'hover:bg-accent/40'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 text-left">
                    <span className={cn('h-2 w-2 rounded-full shrink-0', inCart ? 'bg-primary' : 'bg-emerald-500')} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate leading-tight">{item.name}</p>
                      {cfg.showBrandGrid && (item.manufacturer || item.model) && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {[item.manufacturer, item.model].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {item.description ? (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{item.description}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                      )}
                      {item.item_type === 'SERVICE' && (
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
                          {item.duration_minutes ? `Service · ${item.duration_minutes}min` : 'Service'}
                        </span>
                      )}
                      {item.item_type === 'GOODS' && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Goods</span>
                      )}
                      {item.item_type === 'RECIPE' && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Menu</span>
                      )}
                      {(item.hasVariants || item.variants?.length) ? (
                        <span className="text-[10px] text-primary">Choose variant</span>
                      ) : item.modifierGroups?.length ? (
                        <span className="text-[10px] text-primary">Has options</span>
                      ) : null}
                      {cfg.showStockBadge && item.stockQuantity !== undefined && (
                        <span className="block mt-0.5">
                          <StockBadge quantity={item.stockQuantity} itemType={item.item_type} />
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-bold font-mono text-right w-24">
                    KES {item.price.toLocaleString()}
                  </span>
                  {inCart ? (
                    <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                      {inCart.quantity}
                    </span>
                  ) : (
                    <span className="h-6 w-6 rounded-full border-2 border-border flex items-center justify-center shrink-0">
                      <Plus className="h-3 w-3 text-muted-foreground" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : displayMode === 'image_grid' ? (
          /* ─── IMAGE GRID MODE ─── */
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {filteredItems.map((item) => {
              const inCart = cart.find((c) => c.id === item.id && !c.selectedModifiers);
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemTap(item)}
                  className={cn(
                    'relative rounded-2xl border-2 overflow-hidden transition-all active:scale-95 touch-manipulation',
                    inCart ? 'border-primary shadow-md shadow-primary/10' : 'border-border hover:border-primary/40'
                  )}
                >
                  <div className="aspect-square bg-muted flex items-center justify-center">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="h-10 w-10 text-muted-foreground/20" />
                    )}
                  </div>
                  {/* Availability dot */}
                  <span className="absolute top-2 left-2 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                  {inCart && (
                    <div className="absolute top-2 right-2 h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow-lg">
                      {inCart.quantity}
                    </div>
                  )}
                  <div className="p-3 bg-card">
                    <p className="text-sm font-bold truncate leading-tight">{item.name}</p>
                    {cfg.showBrandGrid && (item.manufacturer || item.model) && (
                      <p className="text-[10px] text-muted-foreground truncate leading-tight">
                        {[item.manufacturer, item.model].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5 leading-tight">{item.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs font-bold font-mono text-primary">KES {item.price.toLocaleString()}</p>
                      {(item.hasVariants || item.variants?.length) ? (
                        <span className="text-[10px] text-primary">Variants</span>
                      ) : item.modifierGroups?.length ? (
                        <span className="text-[10px] text-primary">Has options</span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* ─── CARD MODE (default) — 2-col portrait → 5-col wide desktop ─── */
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {filteredItems.map((item) => {
              const inCart = cart.find((c) => c.id === item.id && !c.selectedModifiers);
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemTap(item)}
                  className={cn(
                    'relative flex flex-col items-start justify-between p-4 rounded-2xl border-2 transition-all min-h-30 touch-manipulation',
                    'active:scale-95 hover:shadow-md',
                    inCart
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border bg-card hover:border-primary/30'
                  )}
                >
                  {/* Top row: availability dot + quantity badge */}
                  <div className="flex items-center justify-between w-full mb-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    {inCart && (
                      <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                        {inCart.quantity}
                      </span>
                    )}
                  </div>
                  {/* Name */}
                  <span className="text-sm font-bold text-left leading-tight line-clamp-2 flex-1">{item.name}</span>
                  {cfg.showBrandGrid && (item.manufacturer || item.model) && (
                    <span className="text-[10px] text-muted-foreground text-left truncate w-full">
                      {[item.manufacturer, item.model].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {/* Price row */}
                  <div className="flex items-center justify-between w-full mt-2">
                    <span className="text-xs font-bold font-mono text-primary">
                      KES {item.price.toLocaleString()}
                    </span>
                    {item.item_type === 'SERVICE' ? (
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded font-semibold">
                        {item.duration_minutes ? `${item.duration_minutes}min` : 'Service'}
                      </span>
                    ) : (item.hasVariants || item.variants?.length) ? (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Variants</span>
                    ) : item.modifierGroups?.length ? (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Options</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {t.totalPages > 1 && (
        <div className="shrink-0 px-4 py-2.5 border-t border-border flex items-center justify-between bg-background">
          <span className="text-xs text-muted-foreground">
            {((t.page - 1) * t.PAGE_SIZE) + 1}–{Math.min(t.page * t.PAGE_SIZE, t.totalItems)} of {t.totalItems} items
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
    </>
  );
}
