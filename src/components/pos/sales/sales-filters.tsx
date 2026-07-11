'use client';

import { Filter } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/base';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker';
import { PAYMENT_STATUSES, SHIPPING_STATUSES, SOURCES, PAYMENT_METHOD_OPTIONS } from './sales-shared';

export interface SalesFilterState {
  outletId: string;
  customer: string;
  paymentStatus: string;
  paymentMethod: string;
  shippingStatus: string;
  userId: string;
  source: string;
  subscriptions: boolean;
  range: DateRange;
  /** Order-total (payable) range. Empty string = unbounded on that side. */
  minTotal: number | '';
  maxTotal: number | '';
}

// Upper bound of the amount slider track. Numeric inputs allow exact values above this when a
// tenant regularly rings up larger tickets; the slider itself is a quick coarse selector.
const AMOUNT_SLIDER_MAX = 100_000;
const AMOUNT_SLIDER_STEP = 100;

/** Dual-thumb amount range slider + exact numeric inputs. Emits `min`/`max` as numbers or ''. */
function AmountRangeSlider({
  min, max, onChange,
}: {
  min: number | '';
  max: number | '';
  onChange: (patch: { minTotal?: number | ''; maxTotal?: number | '' }) => void;
}) {
  const lo = min === '' ? 0 : Math.min(min, AMOUNT_SLIDER_MAX);
  const hi = max === '' ? AMOUNT_SLIDER_MAX : Math.min(max, AMOUNT_SLIDER_MAX);
  const pct = (v: number) => `${(v / AMOUNT_SLIDER_MAX) * 100}%`;

  return (
    <div className="sm:col-span-2 lg:col-span-4">
      {/* The inputs are pointer-events-none so the two overlaid tracks don't block each other;
          only their thumbs re-enable pointer events so both are independently draggable. */}
      <style>{`
        .range-thumb::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; pointer-events: auto; height: 16px; width: 16px; border-radius: 9999px; background: hsl(var(--primary)); border: 2px solid hsl(var(--background)); cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
        .range-thumb::-moz-range-thumb { pointer-events: auto; height: 16px; width: 16px; border-radius: 9999px; background: hsl(var(--primary)); border: 2px solid hsl(var(--background)); cursor: pointer; }
        .range-thumb { background: transparent; }
      `}</style>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground">Order Total (KES)</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {min === '' ? '0' : min.toLocaleString()} – {max === '' ? `${AMOUNT_SLIDER_MAX.toLocaleString()}+` : max.toLocaleString()}
        </span>
      </div>
      {/* Overlaid dual range inputs form the progress bar; the filled band shows the selection. */}
      <div className="relative h-6 mt-1">
        <div className="absolute top-1/2 -translate-y-1/2 h-1.5 w-full rounded-full bg-accent/60" />
        <div className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-primary"
          style={{ left: pct(lo), right: `calc(100% - ${pct(hi)})` }} />
        <input type="range" min={0} max={AMOUNT_SLIDER_MAX} step={AMOUNT_SLIDER_STEP} value={lo}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), hi);
            onChange({ minTotal: v <= 0 ? '' : v });
          }}
          className="range-thumb absolute inset-x-0 top-0 h-6 w-full appearance-none bg-transparent pointer-events-none"
          aria-label="Minimum order total" />
        <input type="range" min={0} max={AMOUNT_SLIDER_MAX} step={AMOUNT_SLIDER_STEP} value={hi}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), lo);
            onChange({ maxTotal: v >= AMOUNT_SLIDER_MAX ? '' : v });
          }}
          className="range-thumb absolute inset-x-0 top-0 h-6 w-full appearance-none bg-transparent pointer-events-none"
          aria-label="Maximum order total" />
      </div>
      <div className="flex items-center gap-2 mt-1">
        <input type="number" min={0} placeholder="Min" value={min}
          onChange={(e) => onChange({ minTotal: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })}
          className="w-full bg-accent/30 border border-border rounded-lg py-1.5 px-2 text-xs tabular-nums" />
        <span className="text-muted-foreground text-xs">–</span>
        <input type="number" min={0} placeholder="Max" value={max}
          onChange={(e) => onChange({ maxTotal: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })}
          className="w-full bg-accent/30 border border-border rounded-lg py-1.5 px-2 text-xs tabular-nums" />
        {(min !== '' || max !== '') && (
          <button type="button" onClick={() => onChange({ minTotal: '', maxTotal: '' })}
            className="text-[11px] text-muted-foreground hover:text-foreground whitespace-nowrap">Clear</button>
        )}
      </div>
    </div>
  );
}

/**
 * SalesFilters — the All-Sales filter bar. Outlets come from the shared outlet store,
 * payment methods from the tenant's LIVE tenders (not a hardcoded list), staff from the
 * staff list. Emits partial patches; the parent owns state + page reset.
 */
export function SalesFilters({ state, onChange, outlets, staff, fixedSource, hideUserFilter }: {
  state: SalesFilterState;
  onChange: (patch: Partial<SalesFilterState>) => void;
  outlets: { id: string; name: string }[];
  staff: any[];
  fixedSource?: string;
  /** Own-only users (cashiers/waiters on "My Sales") must not filter by other users (QA req 6). */
  hideUserFilter?: boolean;
}) {
  // Payment Method options are the real `payment_data.method` values the terminal records — the POS
  // reuses one generic tender across every method, so tender rows can't drive this list.
  const methodOptions = PAYMENT_METHOD_OPTIONS;

  const selectCls = 'w-full bg-accent/30 border border-border rounded-lg py-2 px-3 text-sm';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><Filter className="h-4 w-4 text-primary" /> Filters</div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="text-[11px] font-semibold text-muted-foreground">Outlets
          <select className={selectCls} value={state.outletId} onChange={(e) => onChange({ outletId: e.target.value })}>
            <option value="">All</option>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-muted-foreground">Customer
          <input className={selectCls} placeholder="Name or phone" value={state.customer} onChange={(e) => onChange({ customer: e.target.value })} />
        </label>
        <label className="text-[11px] font-semibold text-muted-foreground">Payment Status
          <select className={selectCls} value={state.paymentStatus} onChange={(e) => onChange({ paymentStatus: e.target.value })}>
            {PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <div className="text-[11px] font-semibold text-muted-foreground">Date Range
          <DateRangePicker value={state.range} onChange={(range) => onChange({ range })} className="mt-0.5" />
        </div>
        {!hideUserFilter && (
          <label className="text-[11px] font-semibold text-muted-foreground">User
            <select className={selectCls} value={state.userId} onChange={(e) => onChange({ userId: e.target.value })}>
              <option value="">All</option>
              {staff.map((s: any) => <option key={s.id} value={s.user_id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <label className="text-[11px] font-semibold text-muted-foreground">Shipping Status
          <select className={selectCls} value={state.shippingStatus} onChange={(e) => onChange({ shippingStatus: e.target.value })}>
            {SHIPPING_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-muted-foreground">Payment Method
          <select className={selectCls} value={state.paymentMethod} onChange={(e) => onChange({ paymentMethod: e.target.value })}>
            <option value="">All</option>
            {methodOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        {!fixedSource && (
          <label className="text-[11px] font-semibold text-muted-foreground">Sources
            <select className={selectCls} value={state.source} onChange={(e) => onChange({ source: e.target.value })}>
              {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm font-medium self-end pb-2">
          <input type="checkbox" checked={state.subscriptions} onChange={(e) => onChange({ subscriptions: e.target.checked })} className="h-4 w-4" />
          Subscriptions
        </label>
        <AmountRangeSlider min={state.minTotal} max={state.maxTotal} onChange={onChange} />
      </CardContent>
    </Card>
  );
}
