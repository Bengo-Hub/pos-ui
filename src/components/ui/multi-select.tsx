'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Right-aligned secondary text, e.g. a price or code. */
  hint?: string;
  /** Groups the option under a filter chip (e.g. a lab-test category). */
  category?: string;
}

/**
 * Searchable multi-select with category filter chips and selected-value chips.
 *
 * Built because pos-ui had no shared multi-select — only single-value SearchableCombobox plus
 * three private, domain-coupled copies (analytics MultiSelectChips, KDS CategoryChips, discounts
 * ScopeItemPicker). Used by the Examination stage for both lab tests and diagnoses.
 *
 * `onCreate` (optional) enables an "add new" affordance when the typed query matches nothing —
 * the diagnosis catalogue grows organically this way instead of forcing admin pre-configuration.
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  onCreate,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches',
  createLabel = 'Add',
  showCategoryFilter = true,
  disabled,
  className,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  onCreate?: (label: string) => void | Promise<void>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  createLabel?: string;
  showCategoryFilter?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const o of options) if (o.category) set.add(o.category);
    return Array.from(set).sort();
  }, [options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((o) => {
      if (activeCategory && o.category !== activeCategory) return false;
      if (!q) return true;
      return o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q);
    });
  }, [options, query, activeCategory]);

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const exactMatch = useMemo(
    () => options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase()),
    [options, query],
  );

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const handleCreate = async () => {
    const label = query.trim();
    if (!label || !onCreate) return;
    await onCreate(label);
    setQuery('');
  };

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* Selected chips + trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full min-h-[42px] bg-background border border-border rounded-xl py-1.5 px-3 text-sm text-left',
          'flex items-center gap-2 flex-wrap focus:outline-none focus:ring-2 focus:ring-primary/40',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        {selected.length === 0 ? (
          <span className="text-muted-foreground py-1">{placeholder}</span>
        ) : (
          selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
            >
              {byValue.get(v)?.label ?? v}
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Remove ${byValue.get(v)?.label ?? v}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(v);
                }}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </span>
            </span>
          ))
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-background border border-border rounded-lg py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            {showCategoryFilter && categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <FilterChip active={activeCategory === ''} onClick={() => setActiveCategory('')} label="All" />
                {categories.map((c) => (
                  <FilterChip
                    key={c}
                    active={activeCategory === c}
                    onClick={() => setActiveCategory(activeCategory === c ? '' : c)}
                    label={c}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-5">{emptyText}</p>
            ) : (
              filtered.map((o) => {
                const isSelected = selected.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                  >
                    <span
                      className={cn(
                        'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                        isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-border',
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{o.label}</span>
                    {o.hint && <span className="text-xs text-muted-foreground shrink-0">{o.hint}</span>}
                  </button>
                );
              })
            )}
          </div>

          {onCreate && query.trim() && !exactMatch && (
            <button
              type="button"
              onClick={handleCreate}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm border-t border-border text-primary font-medium hover:bg-primary/5 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {createLabel} &ldquo;{query.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Capsule filter chip — the "capsule tabs + badges" house style, shared here so pages stop
 *  hand-rolling it (KDS and Shipments each had their own copy). */
export function FilterChip({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            'px-1.5 rounded-full text-[10px]',
            active ? 'bg-primary-foreground/20' : 'bg-muted',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
