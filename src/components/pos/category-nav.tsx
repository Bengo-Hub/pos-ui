'use client';

import { cn } from '@/lib/utils';
import { LayoutGrid } from 'lucide-react';
import type { POSCategory } from '@/hooks/usePOS';

interface CategoryNavProps {
  /** Typed categories from useCategories (with optional icon / image_url). */
  categories: POSCategory[];
  /** Currently active category name, or 'All'. */
  active: string;
  /** Called with the selected category name (or 'All'). */
  onSelect: (category: string) => void;
  className?: string;
}

const ALL = 'All';

// CategoryIconBadge renders a category's icon: an <img> when it's an image URL,
// the emoji/text inline otherwise, or a fallback grid glyph when absent.
function CategoryIconBadge({
  icon,
  imageUrl,
  fallback = false,
}: {
  icon?: string;
  imageUrl?: string;
  fallback?: boolean;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        aria-hidden
        className="h-5 w-5 rounded object-contain shrink-0"
      />
    );
  }
  if (icon) {
    // Emoji or short icon-class name — render inline. Emoji render as-is; an
    // icon-class name simply shows as text, which still reads acceptably.
    return (
      <span aria-hidden className="text-base leading-none shrink-0">
        {icon}
      </span>
    );
  }
  if (fallback) {
    return <LayoutGrid aria-hidden className="h-4 w-4 shrink-0 opacity-70" />;
  }
  return null;
}

/**
 * CategoryNav — modern icon + label category navigation for the order terminal.
 * Horizontally scrolls on narrow screens; keeps an "All" tab; preserves the
 * active-state styling used elsewhere in the POS. Gracefully handles categories
 * with no icon.
 */
export function CategoryNav({ categories, active, onSelect, className }: CategoryNavProps) {
  return (
    <div
      role="tablist"
      aria-label="Categories"
      className={cn(
        // Single horizontally-scrolling row so every category stays reachable even when there are
        // many (e.g. hospitality menus). flex-nowrap stops tabs wrapping/clipping; the scrollbar is
        // hidden for a clean look (scrollbar-hide + the native props) while still scrolling.
        'flex flex-nowrap gap-2 overflow-x-auto pb-0.5 scrollbar-hide [scrollbar-width:none] [-ms-overflow-style:none] min-w-0',
        className,
      )}
    >
      {/* All tab */}
      <button
        role="tab"
        aria-selected={active === ALL}
        onClick={() => onSelect(ALL)}
        className={cn(
          'flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all min-h-9.5 shrink-0',
          active === ALL
            ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
            : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
        )}
      >
        <LayoutGrid aria-hidden className="h-4 w-4 shrink-0" />
        <span>All</span>
      </button>

      {categories.map((cat) => {
        const isActive = active === cat.name;
        return (
          <button
            key={cat.name}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(cat.name)}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all min-h-9.5 shrink-0',
              isActive
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
            )}
          >
            <CategoryIconBadge icon={cat.icon} imageUrl={cat.image_url} fallback />
            <span>{cat.name}</span>
          </button>
        );
      })}
    </div>
  );
}
