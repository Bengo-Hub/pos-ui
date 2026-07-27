'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Percent, Ticket, Zap, Clock3, Repeat, CalendarClock, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Discount, DiscountInput, DiscountKind } from '@/lib/api/discounts';
import { discountConfigFor } from '@/lib/use-case-config';
import {
  DAYS, MEAL_PERIODS, blankForm, formFromDiscount, toPayload,
  type FormState, type DiscountItemRef,
} from './discount-form-types';
import { ScopeItemPicker, CategoryQuickAdd, type SearchItemsFn, type FetchCategoryItemsFn } from './discount-item-pickers';
import { PairEditor } from './discount-pair-editor';
import { StorefrontBannerFields } from './discount-banner-fields';

export { describeDiscount, describeScope, type DiscountItemRef } from './discount-form-types';

/**
 * DiscountFormModal — the shared, reusable discount create/edit form, covering the FULL
 * capability set of the platform discount source of truth (pos-api Promotion +
 * PromotionRule): percentage / fixed amount / fixed price / BOGO (same-SKU, cross-item,
 * corresponding pair map), item/category/storewide scope, meal periods, and recurring or
 * one-time time windows. The old hotel Happy Hour editor is retired — every deal kind is
 * authored here.
 *
 * Adapter-driven so any surface can host it:
 *   - `onSubmit(payload)` — the host decides which endpoint receives the payload
 *     (pos-ui posts to /pos/promotions; another service's UI forwards via S2S).
 *   - `searchItems(query)` — item search against whatever catalog surface the host has.
 *   - `categories` + `fetchCategoryItems(category)` (optional) — enable category scope
 *     and category bulk-add.
 *   - `happyHourLocked` (optional) — subscription gate: creating NEW happy_hour-kind
 *     discounts is locked (editing an existing one stays allowed); the host renders its
 *     own upgrade flow via `onLockedKindClick`.
 * Promotion into @bengo-hub/shared-ui-lib/discounts is the intended next step once a
 * second UI consumes it — keep this component free of pos-ui-specific imports.
 */
export function DiscountFormModal({
  open, initial, saving, onClose, onSubmit, searchItems, resolveItemName,
  categories, fetchCategoryItems, happyHourLocked, onLockedKindClick,
  useCase, currentOutletId, currentOutletName,
}: {
  open: boolean;
  /** Existing discount to edit; omit for create. */
  initial?: Discount | null;
  saving?: boolean;
  onClose: () => void;
  /** Host decides the destination: /pos/promotions locally, or an S2S forward elsewhere. */
  onSubmit: (payload: DiscountInput) => void | Promise<void>;
  /** Catalog search adapter — lets any service host this modal against its own catalog. */
  searchItems: SearchItemsFn;
  /** Optional SKU → display-name resolver for prefill chips/pairs when editing. */
  resolveItemName?: (sku: string) => string | undefined;
  /** Category names for category scope + bulk-add; omit to hide those affordances. */
  categories?: string[];
  fetchCategoryItems?: FetchCategoryItemsFn;
  /** Subscription gate: when true, CREATING happy_hour-kind discounts is locked. */
  happyHourLocked?: boolean;
  /** Called when the user taps the locked Time Window kind (host opens its upgrade flow). */
  onLockedKindClick?: () => void;
  /** Current outlet's use_case (e.g. 'retail', 'hospitality') — scopes which fields render
   *  (Happy Hour kind + meal period are hospitality-only concepts). Omit to show every field. */
  useCase?: string | null;
  /** Current outlet id + display name — lets the host offer "This outlet only" scoping.
   *  Omit to hide the scope toggle (discount stays tenant-wide, the historical behavior). */
  currentOutletId?: string;
  currentOutletName?: string;
}) {
  const [f, setF] = useState<FormState>(blankForm());
  useEffect(() => {
    if (open) setF(initial ? formFromDiscount(initial, resolveItemName) : blankForm());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  if (!open) return null;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const setBanner = (patch: Partial<FormState['banner']>) => setF((s) => ({ ...s, banner: { ...s.banner, ...patch } }));
  const input = 'mt-1 w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring';

  // Editing an existing happy hour stays allowed even when the feature is locked
  // (grandfathered rows must remain manageable); only NEW happy-hour creation is gated.
  const hhLockedHere = !!happyHourLocked && !(initial && initial.promo_kind === 'happy_hour');
  const isBogo = f.discountType === 'bogo';
  const crossItem = isBogo && f.crossItemGet;
  const isHappyHour = f.kind === 'happy_hour';
  const categoryScopeAvailable = (categories?.length ?? 0) > 0 && !isBogo;

  // Use-case scoping: Happy Hour (time-window scheduling) and meal period are hospitality-only
  // concepts — hide them for retail/pharmacy/quick_service/services so those tenants only ever
  // see the fields that mean something to them (Code + Automatic already cover their "applies
  // without a customer entering anything" need). An existing happy_hour-kind discount edited from
  // a non-hospitality context still shows its own kind (never silently hidden mid-edit).
  const discountCfg = discountConfigFor(useCase);
  const showHappyHourKind = discountCfg.showHappyHourKind || isHappyHour;
  const showMealPeriod = discountCfg.showMealPeriod;

  const ALL_KINDS: { v: DiscountKind; label: string; hint: string; icon: typeof Ticket; locked?: boolean }[] = [
    { v: 'code', label: 'Promo Code', hint: 'Customer/cashier enters a code at checkout', icon: Ticket },
    { v: 'auto', label: 'Automatic', hint: 'Applies to every qualifying sale automatically', icon: Zap },
    { v: 'happy_hour', label: 'Time Window', hint: 'Auto-applies during a recurring or one-time window', icon: Clock3, locked: hhLockedHere },
  ];
  const KINDS = ALL_KINDS.filter((k) => k.v !== 'happy_hour' || showHappyHourKind);

  const submit = async () => {
    const payload = toPayload(f, currentOutletId);
    if (!payload) return;
    await onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
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
            <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Clearance 10% Off / Sundowner Happy Hour" className={input} />
          </label>

          {/* Kind */}
          <div>
            <span className="text-sm font-medium">How it applies</span>
            <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {KINDS.map((k) => {
                const Icon = k.icon;
                return (
                  <button key={k.v} type="button"
                    onClick={() => (k.locked ? onLockedKindClick?.() : set('kind', k.v))}
                    className={cn('rounded-xl border p-3 text-left transition-colors',
                      f.kind === k.v ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-input hover:bg-muted',
                      k.locked && 'opacity-70')}>
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <Icon className="h-3.5 w-3.5" /> {k.label}
                      {k.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{k.locked ? 'Pro feature — tap to upgrade' : k.hint}</span>
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

          {/* Schedule — recurring weekly window vs a single one-time occurrence (happy_hour kind). */}
          {isHappyHour && (
            <>
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
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-sm font-medium">Starts</span>
                    <input type="datetime-local" value={f.startAt} onChange={(e) => set('startAt', e.target.value)} className={input} />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium">Ends</span>
                    <input type="datetime-local" value={f.endAt} onChange={(e) => set('endAt', e.target.value)} className={input} />
                  </label>
                </div>
              )}
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
                <option value="bogo">Buy X Get Y (e.g. Buy 1 Get 1 Free)</option>
              </select>
            </label>
            {isBogo ? (
              <>
                <label className="block">
                  <span className="text-sm font-medium">Buy</span>
                  <input type="number" min="1" value={f.buyQuantity} onChange={(e) => set('buyQuantity', e.target.value)} className={input} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Get <span className="text-xs text-muted-foreground">(free units)</span></span>
                  <input type="number" min="1" value={f.getQuantity} onChange={(e) => set('getQuantity', e.target.value)} className={input} />
                </label>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>

          {isBogo && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-medium">% off the &ldquo;get&rdquo; <span className="text-xs text-muted-foreground">(100 = free)</span></span>
                  <input type="number" min="1" max="100" value={f.getDiscountPercent} onChange={(e) => set('getDiscountPercent', e.target.value)} className={input} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Max cap <span className="text-xs text-muted-foreground">(optional)</span></span>
                  <input type="number" min="0" value={f.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} className={input} />
                </label>
              </div>
              {/* Corresponding cross-item pairing: "buy a Large pizza, get the MATCHING Small free". */}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.crossItemGet}
                  onChange={(e) => set('crossItemGet', e.target.checked)}
                  className="h-4 w-4 rounded border-input" />
                Free item is a corresponding different item (e.g. buy a Large pizza, get the matching Small free)
              </label>
              {crossItem && (
                <div className="rounded-xl border border-border p-3 space-y-3 bg-accent/5">
                  <span className="text-sm font-medium">Pairings — buy → get free</span>
                  <PairEditor pairs={f.pairs} onChange={(pairs) => set('pairs', pairs)} searchItems={searchItems} />
                  <p className="text-xs text-muted-foreground">
                    Each row maps a bought item to the exact free item the customer gets. When the bought
                    item is rung up during the window, the terminal auto-adds its matching free item and
                    prices it per the deal — the cashier doesn&apos;t add it manually.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Scope — hidden for corresponding cross-item BOGO (the pairing rows define the scope). */}
          {!crossItem && (
            <div>
              <span className="text-sm font-medium">Applies to</span>
              <div className="mt-1 flex gap-2 mb-2">
                <button type="button" onClick={() => set('scopeMode', 'all')}
                  className={cn('flex-1 py-2 rounded-xl border text-sm font-medium transition-colors',
                    f.scopeMode === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted')}>
                  All items
                </button>
                <button type="button" onClick={() => set('scopeMode', 'items')}
                  className={cn('flex-1 py-2 rounded-xl border text-sm font-medium transition-colors',
                    f.scopeMode === 'items' ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted')}>
                  Specific items
                </button>
                {categoryScopeAvailable && (
                  <button type="button" onClick={() => set('scopeMode', 'category')}
                    className={cn('flex-1 py-2 rounded-xl border text-sm font-medium transition-colors',
                      f.scopeMode === 'category' ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted')}>
                    Whole categories
                  </button>
                )}
              </div>
              {isBogo && f.scopeMode === 'all' && (
                <p className="mb-2 text-xs text-amber-600">
                  Buy X Get Y needs specific items — &ldquo;All items&rdquo; has no well-defined pairing unit.
                </p>
              )}
              {f.scopeMode === 'items' && (
                <div className="space-y-3">
                  <ScopeItemPicker selected={f.items} onChange={(items) => set('items', items)} searchItems={searchItems} />
                  {categories && fetchCategoryItems && (
                    <CategoryQuickAdd selected={f.items} onChange={(items) => set('items', items)}
                      categories={categories} fetchCategoryItems={fetchCategoryItems} />
                  )}
                </div>
              )}
              {f.scopeMode === 'category' && categoryScopeAvailable && (
                <div className="flex flex-wrap gap-1.5">
                  {categories!.map((c) => (
                    <button key={c} type="button"
                      onClick={() => set('categories', f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c])}
                      className={cn('px-2.5 py-1 rounded-full text-xs border font-medium transition-colors',
                        f.categories.includes(c) ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-accent')}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Meal period (hospitality-only) + validity (code/auto use start/end as validity;
              happy_hour one-time has its own). */}
          <div className={cn('grid grid-cols-1 gap-3', showMealPeriod && 'sm:grid-cols-2')}>
            {showMealPeriod && (
              <label className="block">
                <span className="text-sm font-medium">Meal period <span className="text-xs text-muted-foreground">(optional)</span></span>
                <select value={f.mealPeriod} onChange={(e) => set('mealPeriod', e.target.value)} className={input}>
                  <option value="">— Not meal-specific —</option>
                  {MEAL_PERIODS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </label>
            )}
            {!isHappyHour && (
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
            )}
          </div>

          {/* Outlet scope — only offered when the host tells us which outlet we're in. */}
          {currentOutletId && (
            <div>
              <span className="text-sm font-medium">Applies at</span>
              <div className="mt-1 flex gap-2">
                <button type="button" onClick={() => set('outletScope', 'all')}
                  className={cn('flex-1 py-2 rounded-xl border text-sm font-medium transition-colors',
                    f.outletScope === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted')}>
                  All outlets
                </button>
                <button type="button" onClick={() => set('outletScope', 'this_outlet')}
                  className={cn('flex-1 py-2 rounded-xl border text-sm font-medium transition-colors',
                    f.outletScope === 'this_outlet' ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted')}>
                  {currentOutletName || 'This outlet'} only
                </button>
              </div>
            </div>
          )}

          <StorefrontBannerFields banner={f.banner} onChange={setBanner} />

          <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            Discounts are stored once in the platform&apos;s discount source of truth and apply on the POS
            terminal, back-office Add Sale, and any integrated service — including Buy-X-get-Y and
            cross-item pairing deals.
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
