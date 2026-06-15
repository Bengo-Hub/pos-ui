'use client';

import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

export interface PickerEntry {
  name: string;
  image_url?: string;
  icon?: string;
}

interface CategoryBrandDrawerProps {
  open: boolean;
  mode: 'category' | 'brand';
  entries: PickerEntry[];
  /** Currently-selected value ('All' when none). */
  active: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

/**
 * Full-screen picker drawer for categories / brands — opened from the terminal's "Browse"
 * button (mirrors the godigital reference). Selecting an entry filters the product grid and
 * closes the drawer. Always offers an "All" card to clear the filter.
 */
export function CategoryBrandDrawer({
  open,
  mode,
  entries,
  active,
  onSelect,
  onClose,
}: CategoryBrandDrawerProps) {
  if (!open) return null;

  const title = mode === 'brand' ? 'Brands' : 'Category';
  const allLabel = mode === 'brand' ? 'All Brands' : 'All Categories';

  const pick = (value: string) => {
    onSelect(value);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
        <span className="flex-1" />
        <h2 className="text-xl font-bold text-primary">{title}</h2>
        <div className="flex-1 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-10 w-10 rounded-xl bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
          {/* All card */}
          <button
            type="button"
            onClick={() => pick('All')}
            className={cn(
              'flex items-center justify-center text-center min-h-[88px] rounded-2xl border p-4 font-semibold transition-colors',
              active === 'All'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card hover:border-primary/40',
            )}
          >
            {allLabel}
          </button>

          {entries.map((e) => (
            <button
              key={e.name}
              type="button"
              onClick={() => pick(e.name)}
              className={cn(
                'flex flex-col items-center justify-center gap-2 text-center min-h-[88px] rounded-2xl border p-4 font-semibold transition-colors',
                active === e.name
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card hover:border-primary/40',
              )}
            >
              {e.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.image_url} alt={e.name} className="h-10 w-10 object-contain rounded-lg" />
              )}
              <span className="line-clamp-2">{e.name}</span>
            </button>
          ))}
        </div>

        {entries.length === 0 && (
          <p className="text-center text-sm text-muted-foreground mt-10">
            No {mode === 'brand' ? 'brands' : 'categories'} available.
          </p>
        )}
      </div>
    </div>
  );
}
