'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/base';
import {
  useActiveHappyHours, useHappyHours, useCreateHappyHour, useUpdateHappyHour, useDeleteHappyHour,
} from '@/hooks/useHotel';
import { useMenuItems, useCategories, type CatalogItem } from '@/hooks/usePOS';
import { usePermissions, P } from '@/hooks/usePermissions';
import type { HappyHourInput, HappyHourPromotion } from '@/lib/api/hotel';
import { Loader2, Plus, Wine, Pencil, Trash2, Search, X, CalendarClock, Repeat, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

const DAYS = [
  { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' },
  { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 0, l: 'Sun' },
];

type DiscountType = 'percentage' | 'fixed_amount' | 'fixed_price' | 'bogo';
type ScheduleMode = 'recurring' | 'one_time';

interface FormState {
  name: string;
  scheduleMode: ScheduleMode;
  days: number[];
  windowStart: string;
  windowEnd: string;
  startAt: string; // datetime-local
  endAt: string;   // datetime-local
  scopeAll: boolean;
  items: CatalogItem[]; // selected items when scopeAll is false
  discountType: DiscountType;
  discountValue: string;
  buyQuantity: string;
  getQuantity: string;
  getDiscountPercent: string;
  maxDiscount: string;
  mealPeriod: string;
}

function blankForm(): FormState {
  return {
    name: '',
    scheduleMode: 'recurring',
    days: [1, 2, 3, 4, 5],
    windowStart: '16:00',
    windowEnd: '18:00',
    startAt: '',
    endAt: '',
    scopeAll: true,
    items: [],
    discountType: 'percentage',
    discountValue: '20',
    buyQuantity: '1',
    getQuantity: '1',
    getDiscountPercent: '100',
    maxDiscount: '',
    mealPeriod: '',
  };
}

/** Rehydrate the edit form from a promotion + its embedded rule. */
function formFromPromotion(p: HappyHourPromotion, itemsBySku: Map<string, CatalogItem>): FormState {
  const r = p.rule;
  const isOneTime = !!(p.start_at && !p.days_of_week?.length);
  return {
    name: p.name,
    scheduleMode: isOneTime ? 'one_time' : 'recurring',
    days: p.days_of_week ?? [],
    windowStart: p.window_start ?? '16:00',
    windowEnd: p.window_end ?? '18:00',
    startAt: p.start_at ? p.start_at.slice(0, 16) : '',
    endAt: p.end_at ? p.end_at.slice(0, 16) : '',
    scopeAll: !r || r.scope_type === 'all' || !r.scope_ids?.length,
    items: (r?.scope_ids ?? []).map((sku) => itemsBySku.get(sku)).filter((x): x is CatalogItem => !!x),
    discountType: (r?.discount_type as DiscountType) ?? 'percentage',
    discountValue: String(r?.discount_value ?? 20),
    buyQuantity: String(r?.buy_quantity ?? 1),
    getQuantity: String(r?.get_quantity ?? 1),
    getDiscountPercent: String(r?.get_discount_percent ?? 100),
    maxDiscount: r?.max_discount ? String(r.max_discount) : '',
    mealPeriod: r?.meal_period ?? '',
  };
}

function toPayload(f: FormState): HappyHourInput | null {
  if (!f.name.trim()) { toast.error('Name is required'); return null; }
  if (f.scheduleMode === 'recurring' && f.days.length === 0) { toast.error('Pick at least one day'); return null; }
  if (f.scheduleMode === 'one_time' && (!f.startAt || !f.endAt)) { toast.error('Pick a start and end date/time'); return null; }
  if (!f.scopeAll && f.items.length === 0) { toast.error('Pick at least one item, or switch to "All items"'); return null; }

  const body: HappyHourInput = {
    name: f.name.trim(),
    promo_kind: 'happy_hour',
    days_of_week: f.scheduleMode === 'recurring' ? f.days : [],
    window_start: f.windowStart,
    window_end: f.windowEnd,
    start_at: f.scheduleMode === 'one_time' ? new Date(f.startAt).toISOString() : null,
    end_at: f.scheduleMode === 'one_time' ? new Date(f.endAt).toISOString() : null,
    auto_apply: true,
    scope_type: f.scopeAll ? 'all' : 'item',
    scope_ids: f.scopeAll ? [] : f.items.map((i) => i.sku),
    discount_type: f.discountType,
    discount_value: f.discountType === 'bogo' ? 0 : parseFloat(f.discountValue) || 0,
    ...(f.discountType === 'bogo' ? {
      buy_quantity: parseInt(f.buyQuantity, 10) || 1,
      get_quantity: parseInt(f.getQuantity, 10) || 1,
      get_discount_percent: parseFloat(f.getDiscountPercent) || 100,
    } : {}),
    ...(f.maxDiscount ? { max_discount: parseFloat(f.maxDiscount) } : {}),
    ...(f.mealPeriod ? { meal_period: f.mealPeriod as HappyHourInput['meal_period'] } : {}),
  };
  return body;
}

function describeDeal(f: Pick<FormState, 'discountType' | 'discountValue' | 'buyQuantity' | 'getQuantity' | 'getDiscountPercent'>): string {
  switch (f.discountType) {
    case 'percentage': return `${f.discountValue || 0}% off`;
    case 'fixed_amount': return `KES ${f.discountValue || 0} off`;
    case 'fixed_price': return `Fixed price KES ${f.discountValue || 0}`;
    case 'bogo': {
      const buy = parseInt(f.buyQuantity, 10) || 1;
      const get = parseInt(f.getQuantity, 10) || 1;
      const pct = parseFloat(f.getDiscountPercent) || 100;
      const dealLabel = pct >= 100 ? 'free' : `${pct}% off`;
      return `Buy ${buy} get ${get} ${dealLabel}`;
    }
    default: return '';
  }
}

function ItemPicker({ selected, onChange }: { selected: CatalogItem[]; onChange: (items: CatalogItem[]) => void }) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(t); }, [search]);
  const { data, isFetching } = useMenuItems({ search: debounced, limit: 25 });
  const results = (data?.data ?? []).filter((i) => !selected.some((s) => s.sku === i.sku));

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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search menu items to add…"
          className="w-full pl-8 pr-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {debounced && (
        <div className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border">
          {isFetching ? (
            <div className="p-3 text-center text-xs text-muted-foreground">Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">No matching items</div>
          ) : (
            results.map((i) => (
              <button
                key={i.sku}
                type="button"
                onClick={() => { onChange([...selected, i]); setSearch(''); }}
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

/** Pick a category and bulk-add ALL its items into the (editable) selected-items list.
 *  Items land in the same list as ItemPicker's manual picks, so the user can remove any
 *  preselected item afterward — the deal is still stored as an explicit item list. */
function CategoryQuickAdd({ selected, onChange }: { selected: CatalogItem[]; onChange: (items: CatalogItem[]) => void }) {
  const { data: categoriesResp } = useCategories();
  const categories = (categoriesResp ?? []).map((c) => c.name).filter(Boolean);
  const [pendingCategory, setPendingCategory] = useState('');
  const { data: categoryItems, isFetching } = useMenuItems({ category: pendingCategory || undefined, limit: 200 });

  function addCategory(category: string) {
    setPendingCategory(category);
  }

  // Once the category's items land, merge any not already selected, then reset.
  useEffect(() => {
    if (!pendingCategory || isFetching || !categoryItems) return;
    const incoming = categoryItems.data ?? [];
    const existingSkus = new Set(selected.map((s) => s.sku));
    const merged = [...selected, ...incoming.filter((i) => !existingSkus.has(i.sku))];
    onChange(merged);
    setPendingCategory('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCategory, isFetching, categoryItems]);

  if (categories.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">Or add a whole category</span>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            disabled={pendingCategory === c && isFetching}
            onClick={() => addCategory(c)}
            className="inline-flex items-center gap-1 rounded-full border border-input text-xs font-medium px-2.5 py-1 hover:bg-accent disabled:opacity-50"
          >
            {pendingCategory === c && isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

function PromoForm({ initial, onCancel, onSave, saving }: {
  initial: FormState; onCancel: () => void; onSave: (f: FormState) => void; saving: boolean;
}) {
  const [f, setF] = useState<FormState>(initial);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  function toggleDay(d: number) {
    set('days', f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d]);
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Sundowner Happy Hour"
            className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
        </label>

        {/* Schedule: recurring (repeats weekly on chosen days) vs one-time (a single occurrence). */}
        <div>
          <span className="text-sm font-medium">Schedule</span>
          <div className="mt-1 flex gap-2">
            <button type="button" onClick={() => set('scheduleMode', 'recurring')}
              className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-sm font-medium transition-colors',
                f.scheduleMode === 'recurring' ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted')}>
              <Repeat className="h-3.5 w-3.5" /> Repeating
            </button>
            <button type="button" onClick={() => set('scheduleMode', 'one_time')}
              className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-sm font-medium transition-colors',
                f.scheduleMode === 'one_time' ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted')}>
              <CalendarClock className="h-3.5 w-3.5" /> One-time
            </button>
          </div>
        </div>

        {f.scheduleMode === 'recurring' ? (
          <>
            <div>
              <span className="text-sm font-medium">Days <span className="text-xs text-muted-foreground">(repeats every week)</span></span>
              <div className="mt-1 flex flex-wrap gap-2">
                {DAYS.map((d) => (
                  <button key={d.v} type="button" onClick={() => toggleDay(d.v)}
                    className={cn('px-3 py-1.5 rounded-lg text-sm border transition-colors',
                      f.days.includes(d.v) ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted')}>
                    {d.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">Window Start</span>
                <input type="time" value={f.windowStart} onChange={(e) => set('windowStart', e.target.value)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Window End</span>
                <input type="time" value={f.windowEnd} onChange={(e) => set('windowEnd', e.target.value)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </label>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium">Starts</span>
              <input type="datetime-local" value={f.startAt} onChange={(e) => set('startAt', e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Ends</span>
              <input type="datetime-local" value={f.endAt} onChange={(e) => set('endAt', e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </label>
          </div>
        )}

        {/* Which menu items the deal covers. */}
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
          {!f.scopeAll && (
            <div className="space-y-3">
              <ItemPicker selected={f.items} onChange={(items) => set('items', items)} />
              <CategoryQuickAdd selected={f.items} onChange={(items) => set('items', items)} />
            </div>
          )}
        </div>

        {/* Discount mechanism. */}
        <div>
          <span className="text-sm font-medium">Discount</span>
          <select value={f.discountType} onChange={(e) => set('discountType', e.target.value as DiscountType)}
            className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="percentage">Percentage off</option>
            <option value="fixed_amount">Fixed amount off (KES)</option>
            <option value="fixed_price">Fixed price — negotiated rate (KES)</option>
            <option value="bogo">Buy X Get Y (e.g. Buy 1 Get 1 Free)</option>
          </select>
        </div>

        {f.discountType === 'bogo' ? (
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-sm font-medium">Buy</span>
              <input type="number" min="1" value={f.buyQuantity} onChange={(e) => set('buyQuantity', e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Get</span>
              <input type="number" min="1" value={f.getQuantity} onChange={(e) => set('getQuantity', e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">% off the "get"</span>
              <input type="number" min="1" max="100" value={f.getDiscountPercent} onChange={(e) => set('getDiscountPercent', e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </label>
            {f.scopeAll && (
              <p className="col-span-3 text-xs text-amber-600">
                Buy X Get Y needs specific items selected above — "All items" has no well-defined pairing unit.
              </p>
            )}
          </div>
        ) : (
          <label className="block">
            <span className="text-sm font-medium">
              {f.discountType === 'percentage' ? 'Percentage' : f.discountType === 'fixed_price' ? 'Negotiated Price' : 'Amount off'}
            </span>
            <input type="number" min="0" value={f.discountValue} onChange={(e) => set('discountValue', e.target.value)}
              className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
          </label>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Max discount cap <span className="text-xs text-muted-foreground">(optional)</span></span>
            <input type="number" min="0" value={f.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)}
              className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Meal Period <span className="text-xs text-muted-foreground">(optional)</span></span>
            <select value={f.mealPeriod} onChange={(e) => set('mealPeriod', e.target.value)}
              className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">— Not meal-specific —</option>
              <option value="breakfast">Breakfast</option>
              <option value="am_break">AM Break</option>
              <option value="lunch">Lunch</option>
              <option value="pm_break">PM Break</option>
              <option value="dinner">Dinner</option>
            </select>
          </label>
        </div>

        <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          Preview: <span className="font-medium text-foreground">{describeDeal(f)}</span>
          {!f.scopeAll && f.items.length > 0 && <> on {f.items.map((i) => i.name).join(', ')}</>}
          {f.scopeAll && <> storewide</>}.
          The terminal will alert the waiter/cashier when a covered item is added to the cart.
        </p>

        <div className="flex gap-3 pt-1">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-border font-medium hover:bg-muted transition-colors">Cancel</button>
          <button onClick={() => onSave(f)} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function HappyHourPageInner() {
  const { data: active = [] } = useActiveHappyHours();
  const { data: all = [], isLoading } = useHappyHours();
  const createMut = useCreateHappyHour();
  const updateMut = useUpdateHappyHour();
  const deleteMut = useDeleteHappyHour();
  const { can } = usePermissions();
  const canManage = can(P.PROMOTIONS_ADD);

  const [mode, setMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editing, setEditing] = useState<HappyHourPromotion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HappyHourPromotion | null>(null);

  // Resolve selected items' names for the edit form's ItemPicker prefill (rule.scope_ids only
  // carries SKUs) — search each sku individually is wasteful, so instead resolve lazily: fetch
  // a wide catalog page once and index by sku (happy-hour item lists are typically small).
  const { data: catalogPage } = useMenuItems({ limit: 100 });
  const itemsBySku = useMemo(() => {
    const m = new Map<string, CatalogItem>();
    for (const i of catalogPage?.data ?? []) m.set(i.sku, i);
    return m;
  }, [catalogPage]);

  const happyHours = all.filter((p) => p.promo_kind === 'happy_hour');

  async function handleSave(f: FormState) {
    const body = toPayload(f);
    if (!body) return;
    try {
      if (mode === 'edit' && editing) {
        await updateMut.mutateAsync({ id: editing.id, body });
        toast.success('Happy hour updated');
      } else {
        await createMut.mutateAsync(body);
        toast.success('Happy hour created');
      }
      setMode('closed');
      setEditing(null);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to save happy hour'));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      toast.success('Happy hour deleted');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to delete happy hour'));
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Wine className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Happy Hour</h1>
            <p className="text-sm text-muted-foreground">Time-windowed menu-item discounts &amp; promotions</p>
          </div>
        </div>
        {canManage && mode === 'closed' && (
          <button
            onClick={() => { setEditing(null); setMode('create'); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> New
          </button>
        )}
      </div>

      {active.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-green-600 mb-2">● Active now</p>
            <ul className="space-y-1 text-sm">
              {active.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="text-muted-foreground">until {p.window_end ?? (p.end_at ? new Date(p.end_at).toLocaleString() : '—')}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {mode !== 'closed' && canManage && (
        <PromoForm
          key={editing?.id ?? 'new'}
          initial={editing ? formFromPromotion(editing, itemsBySku) : blankForm()}
          onCancel={() => { setMode('closed'); setEditing(null); }}
          onSave={handleSave}
          saving={createMut.isPending || updateMut.isPending}
        />
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : happyHours.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No happy hours configured yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {happyHours.map((p) => {
                const isOneTime = !!(p.start_at && !p.days_of_week?.length);
                return (
                  <li key={p.id} className="flex items-center justify-between px-5 py-3 gap-3">
                    <div className="min-w-0">
                      <p className="font-medium flex items-center gap-1.5">
                        {isOneTime ? <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <Repeat className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        {p.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {isOneTime
                          ? `${p.start_at ? new Date(p.start_at).toLocaleString() : ''} → ${p.end_at ? new Date(p.end_at).toLocaleString() : ''}`
                          : `${(p.days_of_week ?? []).map((d) => DAYS.find((x) => x.v === d)?.l).join(', ')} · ${p.window_start}–${p.window_end}`}
                        {p.rule && <> · {describeDeal({
                          discountType: p.rule.discount_type, discountValue: String(p.rule.discount_value),
                          buyQuantity: String(p.rule.buy_quantity), getQuantity: String(p.rule.get_quantity),
                          getDiscountPercent: String(p.rule.get_discount_percent),
                        })}</>}
                        {p.rule?.scope_ids?.length ? ` on ${p.rule.scope_ids.length} item(s)` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('text-xs px-2 py-1 rounded-full', p.status === 'active' ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground')}>
                        {p.status}
                      </span>
                      {canManage && (
                        <>
                          <button title="Edit" onClick={() => { setEditing(p); setMode('edit'); }}
                            className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent">
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button title="Delete" onClick={() => setDeleteTarget(p)}
                            className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete happy hour?"
        description={`"${deleteTarget?.name}" will stop applying immediately. This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default function HappyHourPage() {
  return (
    <ModuleGate moduleKey="hotel" fallback={<ModuleUnavailablePage moduleKey="hotel" />}>
      <HappyHourPageInner />
    </ModuleGate>
  );
}
