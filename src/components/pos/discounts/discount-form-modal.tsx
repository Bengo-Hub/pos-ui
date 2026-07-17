'use client';

import { useEffect, useState } from 'react';
import { X, Search, Plus, Loader2, Percent, Ticket, Zap, Clock3 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Discount, DiscountInput, DiscountKind } from '@/lib/api/discounts';

/**
 * DiscountFormModal — the shared, reusable discount create/edit form.
 *
 * Discounts live in ONE source of truth (pos-api Promotion + PromotionRule); this modal
 * serializes the exact payload shape that both the tenant-facing POST/PATCH
 * /pos/promotions endpoints and the cross-service POST /s2s/{tenant}/discounts endpoint
 * accept. It is deliberately adapter-driven so any surface can host it:
 *   - `onSubmit(payload)` — the host decides which endpoint receives the payload
 *     (pos-ui posts to /pos/promotions; another service's UI posts to its own backend,
 *     which forwards via S2S to the source of truth).
 *   - `searchItems(query)` — the host supplies item search so the scope picker works
 *     against whatever catalog surface it has.
 * Promotion into @bengo-hub/shared-ui-lib/discounts is the intended next step once a
 * second UI consumes it — keep this component free of pos-ui-specific imports.
 *
 * BOGO / cross-item pairing deals are intentionally NOT offered here — those are managed
 * in the dedicated Happy Hour editor (hotel/happy-hour), which shares the same rows.
 */

export interface DiscountItemRef {
  sku: string;
  name: string;
}

interface FormState {
  name: string;
  kind: DiscountKind;
  promoCode: string;
  discountType: 'percentage' | 'fixed_amount' | 'fixed_price';
  discountValue: string;
  maxDiscount: string;
  scopeAll: boolean;
  items: DiscountItemRef[];
  startAt: string; // datetime-local ('' = starts now)
  endAt: string;   // datetime-local ('' = no expiry)
  // happy_hour window
  days: number[];
  windowStart: string;
  windowEnd: string;
}

const DAYS = [
  { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' },
  { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 0, l: 'Sun' },
];

const KINDS: { v: DiscountKind; label: string; hint: string; icon: typeof Ticket }[] = [
  { v: 'code', label: 'Promo Code', hint: 'Customer/cashier enters a code at checkout', icon: Ticket },
  { v: 'auto', label: 'Automatic', hint: 'Applies to every qualifying sale automatically', icon: Zap },
  { v: 'happy_hour', label: 'Time Window', hint: 'Auto-applies during a recurring daily window', icon: Clock3 },
];

function blankForm(): FormState {
  return {
    name: '', kind: 'code', promoCode: '', discountType: 'percentage', discountValue: '10',
    maxDiscount: '', scopeAll: true, items: [], startAt: '', endAt: '',
    days: [1, 2, 3, 4, 5], windowStart: '16:00', windowEnd: '18:00',
  };
}

function formFromDiscount(d: Discount, resolveName?: (sku: string) => string | undefined): FormState {
  const r = d.rule;
  return {
    name: d.name,
    kind: (['code', 'auto', 'happy_hour'].includes(d.promo_kind) ? d.promo_kind : 'code') as DiscountKind,
    promoCode: d.promo_code ?? '',
    discountType: (r?.discount_type === 'bogo' ? 'percentage' : (r?.discount_type as FormState['discountType'])) ?? 'percentage',
    discountValue: String(r?.discount_value ?? 0),
    maxDiscount: r?.max_discount ? String(r.max_discount) : '',
    scopeAll: !r || r.scope_type === 'all' || !r.scope_ids?.length,
    items: (r?.scope_ids ?? []).map((sku) => ({ sku, name: resolveName?.(sku) ?? sku })),
    startAt: d.start_at ? d.start_at.slice(0, 16) : '',
    endAt: d.end_at ? d.end_at.slice(0, 16) : '',
    days: d.days_of_week ?? [1, 2, 3, 4, 5],
    windowStart: d.window_start || '16:00',
    windowEnd: d.window_end || '18:00',
  };
}

function toPayload(f: FormState): DiscountInput | null {
  if (!f.name.trim()) { toast.error('Name is required'); return null; }
  const value = parseFloat(f.discountValue);
  if (!(value > 0)) { toast.error('Enter a discount value greater than zero'); return null; }
  if (f.discountType === 'percentage' && value > 100) { toast.error('Percentage cannot exceed 100'); return null; }
  if (!f.scopeAll && f.items.length === 0) { toast.error('Pick at least one item, or switch to "All items"'); return null; }
  if (f.kind === 'happy_hour' && f.days.length === 0) { toast.error('Pick at least one day for the window'); return null; }

  return {
    name: f.name.trim(),
    promo_kind: f.kind,
    ...(f.kind === 'code' && f.promoCode.trim() ? { promo_code: f.promoCode.trim().toUpperCase() } : {}),
    auto_apply: f.kind !== 'code',
    days_of_week: f.kind === 'happy_hour' ? f.days : [],
    window_start: f.kind === 'happy_hour' ? f.windowStart : '',
    window_end: f.kind === 'happy_hour' ? f.windowEnd : '',
    start_at: f.startAt ? new Date(f.startAt).toISOString() : null,
    end_at: f.endAt ? new Date(f.endAt).toISOString() : null,
    scope_type: f.scopeAll ? 'all' : 'item',
    scope_ids: f.scopeAll ? [] : f.items.map((i) => i.sku),
    discount_type: f.discountType,
    discount_value: value,
    ...(f.maxDiscount ? { max_discount: parseFloat(f.maxDiscount) } : {}),
  };
}

export function describeDiscount(d: Discount): string {
  const r = d.rule;
  if (!r) return '—';
  switch (r.discount_type) {
    case 'percentage': return `${r.discount_value}% off`;
    case 'fixed_amount': return `KES ${r.discount_value} off`;
    case 'fixed_price': return `Fixed price KES ${r.discount_value}`;
    case 'bogo': {
      const pct = r.get_discount_percent || 100;
      return `Buy ${r.buy_quantity || 1} get ${r.get_quantity || 1} ${pct >= 100 ? 'free' : `${pct}% off`}`;
    }
    default: return '—';
  }
}

/** Multi-select item scope picker driven by the injected `searchItems` adapter. */
function ScopeItemPicker({ selected, onChange, searchItems }: {
  selected: DiscountItemRef[];
  onChange: (items: DiscountItemRef[]) => void;
  searchItems: (query: string) => Promise<DiscountItemRef[]>;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<DiscountItemRef[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const found = await searchItems(search.trim());
        setResults(found.filter((i) => !selected.some((s) => s.sku === i.sku)));
      } catch { setResults([]); }
      setBusy(false);
    }, 250);
    return () => clearTimeout(t);
  }, [search, searchItems, selected]);

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

export function DiscountFormModal({ open, initial, saving, onClose, onSubmit, searchItems, resolveItemName }: {
  open: boolean;
  /** Existing discount to edit; omit for create. */
  initial?: Discount | null;
  saving?: boolean;
  onClose: () => void;
  /** Host decides the destination: /pos/promotions locally, or an S2S forward elsewhere. */
  onSubmit: (payload: DiscountInput) => void | Promise<void>;
  /** Catalog search adapter — lets any service host this modal against its own catalog. */
  searchItems: (query: string) => Promise<DiscountItemRef[]>;
  /** Optional SKU → display-name resolver for prefill chips when editing. */
  resolveItemName?: (sku: string) => string | undefined;
}) {
  const [f, setF] = useState<FormState>(blankForm());
  useEffect(() => {
    if (open) setF(initial ? formFromDiscount(initial, resolveItemName) : blankForm());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  if (!open) return null;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const input = 'mt-1 w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring';

  const submit = async () => {
    const payload = toPayload(f);
    if (!payload) return;
    await onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Percent className="h-5 w-5 text-primary" />
            {initial ? 'Edit Discount' : 'New Discount'}
          </h2>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Name</span>
            <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Clearance 10% Off" className={input} />
          </label>

          {/* Kind */}
          <div>
            <span className="text-sm font-medium">How it applies</span>
            <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {KINDS.map((k) => {
                const Icon = k.icon;
                return (
                  <button key={k.v} type="button" onClick={() => set('kind', k.v)}
                    className={cn('rounded-xl border p-3 text-left transition-colors',
                      f.kind === k.v ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-input hover:bg-muted')}>
                    <span className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="h-3.5 w-3.5" /> {k.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{k.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {f.kind === 'code' && (
            <label className="block">
              <span className="text-sm font-medium">Promo code <span className="text-xs text-muted-foreground">(blank = auto-generated)</span></span>
              <input value={f.promoCode} onChange={(e) => set('promoCode', e.target.value.toUpperCase())} placeholder="e.g. SAVE10" className={cn(input, 'font-mono uppercase')} />
            </label>
          )}

          {f.kind === 'happy_hour' && (
            <>
              <div>
                <span className="text-sm font-medium">Days <span className="text-xs text-muted-foreground">(repeats weekly)</span></span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {DAYS.map((d) => (
                    <button key={d.v} type="button"
                      onClick={() => set('days', f.days.includes(d.v) ? f.days.filter((x) => x !== d.v) : [...f.days, d.v])}
                      className={cn('px-3 py-1.5 rounded-lg text-sm border transition-colors',
                        f.days.includes(d.v) ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted')}>
                      {d.l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-medium">Window start</span>
                  <input type="time" value={f.windowStart} onChange={(e) => set('windowStart', e.target.value)} className={input} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Window end</span>
                  <input type="time" value={f.windowEnd} onChange={(e) => set('windowEnd', e.target.value)} className={input} />
                </label>
              </div>
            </>
          )}

          {/* Mechanism */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-sm font-medium">Discount type</span>
              <select value={f.discountType} onChange={(e) => set('discountType', e.target.value as FormState['discountType'])} className={input}>
                <option value="percentage">Percentage off</option>
                <option value="fixed_amount">Fixed amount off (KES)</option>
                <option value="fixed_price">Fixed price (KES)</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">
                {f.discountType === 'percentage' ? 'Percentage' : f.discountType === 'fixed_price' ? 'Price' : 'Amount'}
              </span>
              <input type="number" min="0" value={f.discountValue} onChange={(e) => set('discountValue', e.target.value)} className={input} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Max cap <span className="text-xs text-muted-foreground">(optional)</span></span>
              <input type="number" min="0" value={f.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} className={input} />
            </label>
          </div>

          {/* Scope */}
          <div>
            <span className="text-sm font-medium">Applies to</span>
            <div className="mt-1 flex gap-2 mb-2">
              <button type="button" onClick={() => set('scopeAll', true)}
                className={cn('flex-1 py-2 rounded-xl border text-sm font-medium transition-colors',
                  f.scopeAll ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted')}>
                All items
              </button>
              <button type="button" onClick={() => set('scopeAll', false)}
                className={cn('flex-1 py-2 rounded-xl border text-sm font-medium transition-colors',
                  !f.scopeAll ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted')}>
                Specific items
              </button>
            </div>
            {!f.scopeAll && <ScopeItemPicker selected={f.items} onChange={(items) => set('items', items)} searchItems={searchItems} />}
          </div>

          {/* Validity */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium">Valid from <span className="text-xs text-muted-foreground">(blank = now)</span></span>
              <input type="datetime-local" value={f.startAt} onChange={(e) => set('startAt', e.target.value)} className={input} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Expires <span className="text-xs text-muted-foreground">(blank = never)</span></span>
              <input type="datetime-local" value={f.endAt} onChange={(e) => set('endAt', e.target.value)} className={input} />
            </label>
          </div>

          <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            Discounts are stored once in the platform&apos;s discount source of truth and apply on the POS
            terminal, back-office Add Sale, and any integrated service. Buy-X-get-Y and cross-item deals
            are managed in the Happy Hour editor.
          </p>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border font-medium hover:bg-muted transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Discount'}
          </button>
        </div>
      </div>
    </div>
  );
}
