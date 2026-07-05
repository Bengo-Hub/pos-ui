'use client';

import { useMemo } from 'react';
import { Filter } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/base';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker';
import { useTenders } from '@/hooks/usePOS';
import { PAYMENT_STATUSES, SHIPPING_STATUSES, SOURCES, prettyMethod } from './sales-shared';

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
}

/**
 * SalesFilters — the All-Sales filter bar. Outlets come from the shared outlet store,
 * payment methods from the tenant's LIVE tenders (not a hardcoded list), staff from the
 * staff list. Emits partial patches; the parent owns state + page reset.
 */
export function SalesFilters({ state, onChange, outlets, staff, fixedSource }: {
  state: SalesFilterState;
  onChange: (patch: Partial<SalesFilterState>) => void;
  outlets: { id: string; name: string }[];
  staff: any[];
  fixedSource?: string;
}) {
  const tendersQ = useTenders();
  // Distinct tender types configured for this tenant → the Payment Method options.
  const methodOptions = useMemo(() => {
    const tenders: any[] = (tendersQ.data as any)?.data ?? tendersQ.data ?? [];
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    for (const t of tenders) {
      const type = t?.type;
      if (!type || seen.has(type)) continue;
      seen.add(type);
      opts.push({ value: type, label: prettyMethod(type) });
    }
    return opts;
  }, [tendersQ.data]);

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
        <label className="text-[11px] font-semibold text-muted-foreground">User
          <select className={selectCls} value={state.userId} onChange={(e) => onChange({ userId: e.target.value })}>
            <option value="">All</option>
            {staff.map((s: any) => <option key={s.id} value={s.user_id}>{s.name}</option>)}
          </select>
        </label>
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
      </CardContent>
    </Card>
  );
}
