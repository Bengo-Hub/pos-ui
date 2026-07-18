'use client';

import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import type { PairRow } from './discount-form-types';
import { SingleItemSelect, type SearchItemsFn } from './discount-item-pickers';

/** Cross-item BOGO pairing editor: an explicit list of "buy this → get this free" rows (e.g.
 *  Margherita Large → Margherita Small). This is what makes the free item CORRESPOND to what was
 *  bought and drives the terminal's auto-add. Ported from the retired hotel happy-hour editor. */
export function PairEditor({ pairs, onChange, searchItems }: {
  pairs: PairRow[];
  onChange: (pairs: PairRow[]) => void;
  searchItems: SearchItemsFn;
}) {
  const setRow = (idx: number, patch: Partial<PairRow>) =>
    onChange(pairs.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  const addRow = () => onChange([...pairs, { buySku: '', buyName: '', getSku: '', getName: '' }]);
  const removeRow = (idx: number) => onChange(pairs.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="hidden sm:grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
        <span>Buy this…</span><span /><span>…get this free</span><span />
      </div>
      {pairs.length === 0 && (
        <p className="text-xs text-muted-foreground">No pairs yet — add a &ldquo;buy → get free&rdquo; row below.</p>
      )}
      {pairs.map((p, idx) => (
        <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
          <SingleItemSelect
            value={p.buySku ? { sku: p.buySku, name: p.buyName } : null}
            placeholder="Bought item (e.g. Margherita Large)…"
            onChange={(it) => setRow(idx, { buySku: it?.sku ?? '', buyName: it?.name ?? '' })}
            searchItems={searchItems}
          />
          <span className="hidden sm:flex items-center justify-center text-muted-foreground"><ArrowRight className="h-4 w-4" /></span>
          <SingleItemSelect
            value={p.getSku ? { sku: p.getSku, name: p.getName } : null}
            placeholder="Free item (e.g. Margherita Small)…"
            onChange={(it) => setRow(idx, { getSku: it?.sku ?? '', getName: it?.name ?? '' })}
            searchItems={searchItems}
          />
          <button type="button" onClick={() => removeRow(idx)} aria-label="Remove pair"
            className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-accent justify-self-end">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow}
        className="inline-flex items-center gap-1 rounded-full border border-input text-xs font-medium px-2.5 py-1 hover:bg-accent">
        <Plus className="h-3 w-3" /> Add pair
      </button>
    </div>
  );
}
