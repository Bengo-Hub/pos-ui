'use client';

import { useState } from 'react';
import { Loader2, Minus, Plus, Search, Trash2 } from 'lucide-react';
import { useMenuItems, type CatalogItem } from '@/hooks/usePOS';

export interface ExchangeLine {
  item: CatalogItem;
  quantity: number;
  unitPrice: number;
}

const fmt = (n: number) => `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export const exchangeTotal = (lines: ExchangeLine[]) =>
  lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

/**
 * ExchangeLinesPicker — choose the replacement items for an EXCHANGE return and show the
 * price difference against the returned goods' value: dearer → top-up the customer pays at
 * the till; cheaper → leftover refunded via the return's channel; equal → zero-cash swap.
 */
export function ExchangeLinesPicker({ lines, onChange, returnedValue }: {
  lines: ExchangeLine[];
  onChange: (lines: ExchangeLine[]) => void;
  returnedValue: number;
}) {
  const [search, setSearch] = useState('');
  const { data: catalog, isFetching } = useMenuItems({ search: search || undefined, limit: 15 });
  const results: CatalogItem[] = search ? (catalog?.data ?? []) : [];

  const add = (item: CatalogItem) => {
    const idx = lines.findIndex((l) => l.item.id === item.id);
    if (idx >= 0) {
      onChange(lines.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l)));
    } else {
      onChange([...lines, { item, quantity: 1, unitPrice: item.price ?? 0 }]);
    }
    setSearch('');
  };
  const setQty = (i: number, q: number) =>
    onChange(q <= 0 ? lines.filter((_, x) => x !== i) : lines.map((l, x) => (x === i ? { ...l, quantity: q } : l)));

  const total = exchangeTotal(lines);
  const delta = total - returnedValue;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search replacement product / SKU…"
          className="w-full bg-background border border-border rounded-xl py-2.5 pl-10 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {isFetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {search && results.length > 0 && (
        <div className="border border-border rounded-xl divide-y divide-border max-h-44 overflow-y-auto">
          {results.map((it) => (
            <button key={it.id} type="button" onClick={() => add(it)}
              className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors">
              <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="flex-1 text-sm truncate">{it.name}</span>
              <span className="text-xs text-muted-foreground font-mono">{it.sku}</span>
              <span className="text-xs font-bold text-primary">{fmt(it.price ?? 0)}</span>
            </button>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <div className="border border-border rounded-xl divide-y divide-border">
          {lines.map((l, i) => (
            <div key={l.item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{l.item.name}</p>
                <p className="text-[11px] text-muted-foreground font-mono">{l.item.sku}</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setQty(i, l.quantity - 1)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-accent"><Minus className="h-3 w-3" /></button>
                <span className="w-7 text-center text-sm font-bold tabular-nums">{l.quantity}</span>
                <button type="button" onClick={() => setQty(i, l.quantity + 1)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-accent"><Plus className="h-3 w-3" /></button>
              </div>
              <span className="w-24 text-right tabular-nums text-sm">{fmt(l.unitPrice * l.quantity)}</span>
              <button type="button" onClick={() => setQty(i, 0)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Price-difference summary */}
      <div className="rounded-xl bg-accent/20 border border-border px-4 py-3 text-xs space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Returned goods value</span><span className="tabular-nums font-semibold">{fmt(returnedValue)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Replacement total</span><span className="tabular-nums font-semibold">{fmt(total)}</span></div>
        <div className="flex justify-between pt-1 border-t border-border">
          {delta > 0.009 ? (
            <><span className="font-bold text-amber-700">Top-up to collect</span><span className="tabular-nums font-bold text-amber-700">{fmt(delta)}</span></>
          ) : delta < -0.009 ? (
            <><span className="font-bold text-emerald-700">Refund to customer</span><span className="tabular-nums font-bold text-emerald-700">{fmt(-delta)}</span></>
          ) : (
            <><span className="font-bold">Even swap</span><span className="font-bold">KES 0</span></>
          )}
        </div>
      </div>
    </div>
  );
}
