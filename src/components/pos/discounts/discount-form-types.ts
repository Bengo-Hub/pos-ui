import { toast } from 'sonner';
import type { Discount, DiscountBannerConfig, DiscountInput, DiscountKind, MealPeriod } from '@/lib/api/discounts';

/**
 * Form model + (de)serialization for the shared DiscountFormModal — covers the FULL
 * PromotionRule capability set (BOGO same-SKU / cross-item / corresponding pair map,
 * meal period, category scope, recurring vs one-time schedules).
 *
 * ROUND-TRIP INVARIANT: formFromDiscount(toPayload(f)) must be lossless for every rule
 * shape. The previous form down-converted discount_type='bogo' to 'percentage' on edit,
 * which silently destroyed a live BOGO deal's pairing when saved — never reintroduce a
 * lossy mapping here.
 */

export interface DiscountItemRef {
  sku: string;
  name: string;
}

/** One "buy X → get Y free" correspondence row for the cross-item pairing editor (e.g. Margherita
 *  Large → Margherita Small). SKUs are stored directly so a pair survives edit even when the item
 *  can't be re-resolved from the catalog later; the name is only for display. */
export interface PairRow {
  buySku: string;
  buyName: string;
  getSku: string;
  getName: string;
}

export type DiscountTypeOpt = 'percentage' | 'fixed_amount' | 'fixed_price' | 'bogo';
export type ScheduleMode = 'recurring' | 'one_time';
export type ScopeMode = 'all' | 'items' | 'category';

/** Form model for the "Show on storefront" banner section — camelCase mirror of
 *  DiscountBannerConfig, stored inside Promotion.metadata["banner"] server-side. */
export interface BannerFormState {
  showOnStorefront: boolean;
  bannerTitle: string;
  bannerSubtitle: string;
  bannerImageUrl: string;
  ctaLabel: string;
  ctaLink: string;
  bannerColor: string;
  textColor: string;
  useCases: string[];
}

export interface FormState {
  name: string;
  kind: DiscountKind;
  promoCode: string;
  discountType: DiscountTypeOpt;
  discountValue: string;
  maxDiscount: string;
  mealPeriod: string;
  scopeMode: ScopeMode;
  items: DiscountItemRef[]; // scopeMode='items' — also the BOGO "buy" scope
  categories: string[]; // scopeMode='category' — category NAMES (evaluator matches line category)
  // happy_hour schedule: recurring weekly window vs a single one-time occurrence.
  scheduleMode: ScheduleMode;
  days: number[];
  windowStart: string;
  windowEnd: string;
  startAt: string; // datetime-local ('' = starts now / required for one-time)
  endAt: string;   // datetime-local ('' = no expiry / required for one-time)
  // BOGO mechanism.
  buyQuantity: string;
  getQuantity: string;
  getDiscountPercent: string;
  // Cross-item BOGO ("buy one Large pizza, get the CORRESPONDING Small pizza free"): when true,
  // the free "get" unit is a DIFFERENT item mapped one-to-one from what's bought via `pairs`.
  // When false (default), the free unit is another unit of the same item being bought.
  crossItemGet: boolean;
  pairs: PairRow[];
  // Outlet scope — 'all' (tenant-wide, the historical default) or 'this_outlet' (scoped to
  // whichever outlet the form was opened from). The actual outlet id is supplied by the host
  // at submit time (see toPayload), not stored on the form itself.
  outletScope: 'all' | 'this_outlet';
  // Optional storefront marketing banner — off by default so existing promotions (and every
  // new one that doesn't opt in) are unaffected.
  banner: BannerFormState;
}

export const DAYS = [
  { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' },
  { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 0, l: 'Sun' },
];

export const MEAL_PERIODS: { v: MealPeriod; l: string }[] = [
  { v: 'breakfast', l: 'Breakfast' },
  { v: 'am_break', l: 'AM Break' },
  { v: 'lunch', l: 'Lunch' },
  { v: 'pm_break', l: 'PM Break' },
  { v: 'dinner', l: 'Dinner' },
];

export function blankBanner(): BannerFormState {
  return {
    showOnStorefront: false, bannerTitle: '', bannerSubtitle: '', bannerImageUrl: '',
    ctaLabel: '', ctaLink: '', bannerColor: '', textColor: '', useCases: [],
  };
}

export function blankForm(): FormState {
  return {
    name: '', kind: 'code', promoCode: '', discountType: 'percentage', discountValue: '10',
    maxDiscount: '', mealPeriod: '', scopeMode: 'all', items: [], categories: [],
    scheduleMode: 'recurring', days: [1, 2, 3, 4, 5], windowStart: '16:00', windowEnd: '18:00',
    startAt: '', endAt: '',
    buyQuantity: '1', getQuantity: '1', getDiscountPercent: '100',
    crossItemGet: false, pairs: [],
    outletScope: 'all',
    banner: blankBanner(),
  };
}

/** Rehydrate the banner form section from a stored promotion's metadata["banner"] — LOSSLESS
 *  round-trip is the same invariant formFromDiscount holds for the rest of the form. */
function bannerFromDiscount(d: Discount): BannerFormState {
  const b = d.metadata?.banner;
  if (!b) return blankBanner();
  return {
    showOnStorefront: !!b.show_on_storefront,
    bannerTitle: b.banner_title ?? '',
    bannerSubtitle: b.banner_subtitle ?? '',
    bannerImageUrl: b.banner_image_url ?? '',
    ctaLabel: b.cta_label ?? '',
    ctaLink: b.cta_link ?? '',
    bannerColor: b.banner_color ?? '',
    textColor: b.text_color ?? '',
    useCases: b.use_cases ?? [],
  };
}

/** Serialize the banner form section into the wire shape (DiscountBannerConfig). Always
 *  included in the submitted payload (even when off) so toggling "Show on storefront" back
 *  off actually clears a previously-saved banner instead of leaving stale metadata behind. */
function bannerToPayload(b: BannerFormState): DiscountBannerConfig {
  return {
    show_on_storefront: b.showOnStorefront,
    ...(b.bannerTitle.trim() ? { banner_title: b.bannerTitle.trim() } : {}),
    ...(b.bannerSubtitle.trim() ? { banner_subtitle: b.bannerSubtitle.trim() } : {}),
    ...(b.bannerImageUrl.trim() ? { banner_image_url: b.bannerImageUrl.trim() } : {}),
    ...(b.ctaLabel.trim() ? { cta_label: b.ctaLabel.trim() } : {}),
    ...(b.ctaLink.trim() ? { cta_link: b.ctaLink.trim() } : {}),
    ...(b.bannerColor.trim() ? { banner_color: b.bannerColor.trim() } : {}),
    ...(b.textColor.trim() ? { text_color: b.textColor.trim() } : {}),
    ...(b.useCases.length ? { use_cases: b.useCases } : {}),
  };
}

/** Rehydrate the edit form from a discount + its embedded rule — LOSSLESS for every rule shape. */
export function formFromDiscount(d: Discount, resolveName?: (sku: string) => string | undefined): FormState {
  const r = d.rule;
  const isOneTime = !!(d.start_at && !d.days_of_week?.length);
  const pairMap = r?.get_pair_map ?? {};
  const nameFor = (sku: string) => resolveName?.(sku) ?? sku;
  const pairs: PairRow[] = Object.entries(pairMap).map(([buySku, getSku]) => ({
    buySku, buyName: nameFor(buySku), getSku, getName: nameFor(getSku),
  }));
  const scopeMode: ScopeMode =
    !r || r.scope_type === 'all' || !r.scope_ids?.length
      ? 'all'
      : r.scope_type === 'category'
        ? 'category'
        : 'items';
  return {
    name: d.name,
    kind: (['code', 'auto', 'happy_hour'].includes(d.promo_kind) ? d.promo_kind : 'code') as DiscountKind,
    promoCode: d.promo_code ?? '',
    discountType: (r?.discount_type as DiscountTypeOpt) ?? 'percentage',
    discountValue: String(r?.discount_value ?? 0),
    maxDiscount: r?.max_discount ? String(r.max_discount) : '',
    mealPeriod: r?.meal_period ?? '',
    scopeMode,
    items: scopeMode === 'items' ? (r?.scope_ids ?? []).map((sku) => ({ sku, name: nameFor(sku) })) : [],
    categories: scopeMode === 'category' ? (r?.scope_ids ?? []) : [],
    scheduleMode: isOneTime ? 'one_time' : 'recurring',
    days: d.days_of_week ?? [1, 2, 3, 4, 5],
    windowStart: d.window_start || '16:00',
    windowEnd: d.window_end || '18:00',
    startAt: d.start_at ? d.start_at.slice(0, 16) : '',
    endAt: d.end_at ? d.end_at.slice(0, 16) : '',
    buyQuantity: String(r?.buy_quantity ?? 1),
    getQuantity: String(r?.get_quantity ?? 1),
    getDiscountPercent: String(r?.get_discount_percent ?? 100),
    crossItemGet: pairs.length > 0,
    pairs,
    outletScope: d.outlet_id ? 'this_outlet' : 'all',
    banner: bannerFromDiscount(d),
  };
}

/** Serialize + validate the form. Returns null (with a toast) on validation failure.
 *  `currentOutletId` is the outlet the form was opened from — only used when the user picked
 *  "This outlet only"; always sent explicitly (including as '' for "All outlets") so an EDIT
 *  can clear a previously-set outlet_id back to tenant-wide (the backend's UpdatePromotion
 *  clears outlet_id when it fails to parse a UUID, so omitting the key would leave a stale
 *  scope in place instead of widening it). */
export function toPayload(f: FormState, currentOutletId?: string): DiscountInput | null {
  if (!f.name.trim()) { toast.error('Name is required'); return null; }
  const isHappyHour = f.kind === 'happy_hour';
  const isBogo = f.discountType === 'bogo';
  const crossItem = isBogo && f.crossItemGet;

  const value = parseFloat(f.discountValue);
  if (!isBogo) {
    if (!(value > 0)) { toast.error('Enter a discount value greater than zero'); return null; }
    if (f.discountType === 'percentage' && value > 100) { toast.error('Percentage cannot exceed 100'); return null; }
  }
  if (!crossItem && f.scopeMode === 'items' && f.items.length === 0) {
    toast.error('Pick at least one item, or switch to "All items"'); return null;
  }
  if (f.scopeMode === 'category' && f.categories.length === 0) {
    toast.error('Pick at least one category, or switch to "All items"'); return null;
  }
  if (isBogo && f.scopeMode !== 'items' && !crossItem) {
    toast.error('Buy X Get Y needs specific items — "All items" or a category has no well-defined pairing unit');
    return null;
  }
  if (isHappyHour) {
    if (f.scheduleMode === 'recurring' && f.days.length === 0) { toast.error('Pick at least one day for the window'); return null; }
    if (f.scheduleMode === 'one_time' && (!f.startAt || !f.endAt)) { toast.error('Pick a start and end date/time'); return null; }
  }
  const completePairs = f.pairs.filter((p) => p.buySku && p.getSku);
  if (crossItem && completePairs.length === 0) {
    toast.error('Add at least one "buy → get free" pair, or turn off "Corresponding free item"');
    return null;
  }
  if (crossItem && completePairs.length !== f.pairs.length) {
    toast.error('Every pair needs both a bought item and its free item');
    return null;
  }
  if (f.banner.showOnStorefront && !f.banner.bannerTitle.trim()) {
    toast.error('Banner title is required when "Show on storefront" is on');
    return null;
  }
  // Explicit correspondence map (buy SKU → free get SKU). Server derives scope_ids/get_scope_ids
  // from it, but we send them too so an older backend still applies the deal.
  const pairMap: Record<string, string> = {};
  for (const p of completePairs) pairMap[p.buySku] = p.getSku;

  const oneTime = isHappyHour && f.scheduleMode === 'one_time';
  // Recurring happy hours schedule via days+window (start/end null); one-time happy hours
  // and code/auto validity windows use the explicit datetimes.
  const startAt = isHappyHour && !oneTime ? null : f.startAt ? new Date(f.startAt).toISOString() : null;
  const endAt = isHappyHour && !oneTime ? null : f.endAt ? new Date(f.endAt).toISOString() : null;
  const scopeType: DiscountInput['scope_type'] =
    crossItem ? 'item'
      : f.scopeMode === 'all' ? 'all'
        : f.scopeMode === 'category' ? 'category'
          : 'item';
  const scopeIds =
    crossItem ? completePairs.map((p) => p.buySku)
      : f.scopeMode === 'category' ? f.categories
        : f.scopeMode === 'items' ? f.items.map((i) => i.sku)
          : [];

  return {
    name: f.name.trim(),
    outlet_id: f.outletScope === 'this_outlet' && currentOutletId ? currentOutletId : '',
    promo_kind: f.kind,
    ...(f.kind === 'code' && f.promoCode.trim() ? { promo_code: f.promoCode.trim().toUpperCase() } : {}),
    auto_apply: f.kind !== 'code',
    days_of_week: isHappyHour && !oneTime ? f.days : [],
    window_start: isHappyHour ? f.windowStart : '',
    window_end: isHappyHour ? f.windowEnd : '',
    start_at: startAt,
    end_at: endAt,
    scope_type: scopeType,
    scope_ids: scopeIds,
    discount_type: f.discountType,
    discount_value: isBogo ? 0 : value,
    ...(isBogo ? {
      buy_quantity: parseInt(f.buyQuantity, 10) || 1,
      get_quantity: parseInt(f.getQuantity, 10) || 1,
      get_discount_percent: parseFloat(f.getDiscountPercent) || 100,
      get_scope_ids: crossItem ? completePairs.map((p) => p.getSku) : [],
      get_pair_map: crossItem ? pairMap : {},
    } : {}),
    ...(f.maxDiscount ? { max_discount: parseFloat(f.maxDiscount) } : {}),
    ...(f.mealPeriod ? { meal_period: f.mealPeriod as DiscountInput['meal_period'] } : {}),
    banner: bannerToPayload(f.banner),
  };
}

/** One-line description of a stored discount's mechanism (list rows, pickers). */
export function describeDiscount(d: Discount): string {
  const r = d.rule;
  if (!r) return '—';
  switch (r.discount_type) {
    case 'percentage': return `${r.discount_value}% off`;
    case 'fixed_amount': return `KES ${r.discount_value} off`;
    case 'fixed_price': return `Fixed price KES ${r.discount_value}`;
    case 'bogo': {
      const pct = r.get_discount_percent || 100;
      const pairCount = Object.keys(r.get_pair_map ?? {}).length;
      const base = `Buy ${r.buy_quantity || 1} get ${r.get_quantity || 1} ${pct >= 100 ? 'free' : `${pct}% off`}`;
      return pairCount > 0 ? `${base} · ${pairCount} pairing${pairCount === 1 ? '' : 's'}` : base;
    }
    default: return '—';
  }
}

/** Scope summary for list rows: "storewide", "3 items", "2 categories", "4 pairings". */
export function describeScope(d: Discount): string {
  const r = d.rule;
  if (!r) return 'storewide';
  const pairCount = Object.keys(r.get_pair_map ?? {}).length;
  if (pairCount > 0) return `${pairCount} pairing${pairCount === 1 ? '' : 's'}`;
  if (!r.scope_ids?.length || r.scope_type === 'all') return 'storewide';
  if (r.scope_type === 'category') return `${r.scope_ids.length} categor${r.scope_ids.length === 1 ? 'y' : 'ies'}`;
  return `${r.scope_ids.length} item${r.scope_ids.length === 1 ? '' : 's'}`;
}
