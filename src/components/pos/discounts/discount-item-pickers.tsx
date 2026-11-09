'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { createSearchRunner, useDebouncedValue, useLatestRef } from '@bengo-hub/shared-ui-lib/search';
import type { DiscountItemRef } from './discount-form-types';

/**
 * Item/category pickers for the shared DiscountFormModal — ADAPTER-DRIVEN so the modal
 * stays free of pos-ui-specific imports (its stated design goal): the host injects
 * `searchItems(query)` / `fetchCategoryItems(category)` against whatever catalog surface
 * it has. Ported from the retired hotel happy-hour editor.
 */

/** `ctx.signal` fires when a newer search replaces this one; pass it to the request. */
export type SearchItemsFn = (query: string, ctx?: { signal?: AbortSignal }) => Promise<DiscountItemRef[]>;
export type FetchCategoryItemsFn = (category: string) => Promise<DiscountItemRef[]>;

/**
 * Debounced, latest-wins item search for the pickers below. The term waits for a pause in
 * typing, each new term aborts the request before it, and a late reply never overwrites
 * newer results.
 */
function useItemSearch(search: string, searchItems: SearchItemsFn) {
  const raw = search.trim();
  const term = useDebouncedValue(raw);
  const searchRef = useLatestRef(searchItems);
  const runner = useMemo(
    () => createSearchRunner<DiscountItemRef[]>(() => (q, ctx) => searchRef.current(q, ctx)),
    [searchRef],
  );
  const [results, setResults] = useState<DiscountItemRef[]>([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => () => runner.cancel(), [runner]);
  useEffect(() => {
    if (!term) { runner.cancel(); setResults([]); setFetching(false); return; }
    setFetching(true);
    void runner.run(term).then((outcome) => {
      if (outcome.status === 'stale') return;
      setResults(outcome.status === 'ok' ? outcome.value : []);
      setFetching(false);
    });
  }, [term, runner]);

  // Busy while the pause runs as well, so "No matching items" never flashes for old results.
  return { results, busy: fetching || raw !== term };
}

/** Multi-select item scope picker (chip list + debounced search). */
export function ScopeItemPicker({ selected, onChange, searchItems }: {
  selected: DiscountItemRef[];
  onChange: (items: DiscountItemRef[]) => void;
  searchItems: SearchItemsFn;
}) {
  const [search, setSearch] = useState('');
  const { results: found, busy } = useItemSearch(search, searchItems);
  // Already-picked items are hidden from the results without searching again.
  const results = found.filter((i) => !selected.some((s) => s.sku === i.sku));

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((i) => (
            <span key={i.sku} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs font-medium px-2.5 py-1">
              {i.name}
              <button type="button" onClick={() => onChange(selected.filter((s) => s.sku !== i.sku))} aria-label={`Remove ${i.name}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items to add…"
          className="w-full pl-8 pr-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      {search.trim() && (
        <div className="max-h-44 overflow-y-auto rounded-xl border border-border divide-y divide-border">
          {busy ? (
            <div className="p-3 text-center text-xs text-muted-foreground">Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">No matching items</div>
          ) : results.map((i) => (
            <button key={i.sku} type="button"
              onClick={() => { onChange([...selected, i]); setSearch(''); }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-accent">
              <span>{i.name} <span className="text-xs text-muted-foreground">({i.sku})</span></span>
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pick a category chip and bulk-add ALL its items into the (editable) selected-items list.
 *  Items land in the same list as ScopeItemPicker's manual picks, so the user can remove any
 *  preselected item afterward — the deal is still stored as an explicit item list. */
export function CategoryQuickAdd({ selected, onChange, categories, fetchCategoryItems }: {
  selected: DiscountItemRef[];
  onChange: (items: DiscountItemRef[]) => void;
  categories: string[];
  fetchCategoryItems: FetchCategoryItemsFn;
}) {
  const [pending, setPending] = useState('');

  async function addCategory(category: string) {
    setPending(category);
    try {
      const incoming = await fetchCategoryItems(category);
      const existing = new Set(selected.map((s) => s.sku));
      onChange([...selected, ...incoming.filter((i) => !existing.has(i.sku))]);
    } catch { /* leave selection unchanged */ }
    setPending('');
  }

  if (categories.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">Or add a whole category&apos;s items</span>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            disabled={pending === c}
            onClick={() => addCategory(c)}
            className="inline-flex items-center gap-1 rounded-full border border-input text-xs font-medium px-2.5 py-1 hover:bg-accent disabled:opacity-50"
          >
            {pending === c ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Single-item search+pick (one selection, not a multi-select chip list) — used by each side of a
 *  cross-item pairing row. Stores only sku+name so the caller keeps the SKU even if the item can't
 *  be re-resolved from the catalog later. */
export function SingleItemSelect({ value, placeholder, onChange, searchItems }: {
  value: DiscountItemRef | null;
  placeholder: string;
  onChange: (item: DiscountItemRef | null) => void;
  searchItems: SearchItemsFn;
}) {
  const [search, setSearch] = useState('');
  const { results, busy } = useItemSearch(search, searchItems);
  const [open, setOpen] = useState(false);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm">
        <span className="truncate">{value.name} <span className="text-xs text-muted-foreground">({value.sku})</span></span>
        <button type="button" onClick={() => onChange(null)} aria-label="Change item">
          <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full pl-8 pr-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {open && search.trim() && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-border bg-popover shadow-md divide-y divide-border">
          {busy ? (
            <div className="p-3 text-center text-xs text-muted-foreground">Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">No matching items</div>
          ) : (
            results.map((i) => (
              <button
                key={i.sku}
                type="button"
                onClick={() => { onChange({ sku: i.sku, name: i.name }); setSearch(''); setOpen(false); }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-accent"
              >
                <span>{i.name} <span className="text-xs text-muted-foreground">({i.sku})</span></span>
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
