/**
 * Client-side happy-hour discount calculator — mirrors pos-api
 * internal/modules/promotions/service.go (evaluateRule + calculateBOGODiscount) so the terminal
 * can show the auto-applied deal LIVE (discount line + per-item badge) before the order is
 * placed. The server recomputes authoritatively at checkout, so the two must agree.
 */
import type { Discount as HappyHourPromotion, PromotionRule } from '@/lib/api/discounts';

export interface HHLine {
  sku: string;
  category?: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

export interface HHLineResult {
  amount: number;   // KES saved attributed to this SKU
  freeQty: number;  // BOGO free units
  type: string;     // bogo | percentage | fixed_amount | fixed_price
  label: string;    // e.g. "Buy 1 Get 1 Free", "20% off"
}

export interface HappyHourResult {
  total: number;
  promoName: string;
  bySku: Record<string, HHLineResult>;
}

const norm = (s?: string) => (s ?? '').trim().toLowerCase();
const trimNum = (n: number) => (Number.isInteger(n) ? String(n) : String(n));

/** When a deal started (start_at defaults to its creation time); 0 when unknown. */
const startMs = (p: HappyHourPromotion) => (p.start_at ? Date.parse(p.start_at) || 0 : 0);

/** Deals with the most recently started first, as pos-api promotions.newestFirst orders them. */
export function newestFirst(promos: HappyHourPromotion[]): HappyHourPromotion[] {
  return [...promos].sort((a, b) => startMs(b) - startMs(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/** The lowercased "buy" side of an item-scoped BOGO rule: the get_pair_map keys for a
 *  corresponding-pair deal, otherwise scope_ids. Empty for every other rule. */
export function bogoBuySkus(rule?: PromotionRule | null): Set<string> {
  if (!rule || rule.discount_type !== 'bogo' || rule.scope_type !== 'item') return new Set();
  const pairKeys = Object.keys(rule.get_pair_map ?? {});
  return new Set((pairKeys.length > 0 ? pairKeys : rule.scope_ids ?? []).map(norm).filter(Boolean));
}

/**
 * Which "buy X get Y" deal owns each item when several cover it: the newest (latest start). Maps
 * lower(buy SKU) to that deal's start. A deal that started earlier never earns from an item a newer
 * one covers, so today's "buy a large get a large free" takes the large pizzas from an everyday "buy
 * a large get a small free". Deals that started at the same moment are not ranked (the better saving
 * wins per item). Mirrors pos-api promotions.combineTimedDiscounts.
 */
export function bogoOwners(promos: HappyHourPromotion[]): Map<string, number> {
  const owners = new Map<string, number>();
  for (const p of promos) {
    const start = startMs(p);
    for (const sku of bogoBuySkus(p.rule)) {
      if (!owners.has(sku) || start > owners.get(sku)!) owners.set(sku, start);
    }
  }
  return owners;
}

/** Whether a deal may earn from this buy SKU (no newer deal owns it). */
export function ownsBuySku(p: HappyHourPromotion, sku: string, owners: Map<string, number>): boolean {
  const owner = owners.get(norm(sku));
  return owner === undefined || owner <= startMs(p);
}

function evalRule(rule: PromotionRule, lines: HHLine[], currency = 'KES'): { total: number; bySku: Record<string, HHLineResult> } {
  if (rule.discount_type === 'bogo') return calcBogo(rule, lines);

  const ids = new Set((rule.scope_ids ?? []).map(norm));
  const scoped = ids.size > 0 && (rule.scope_type === 'item' || rule.scope_type === 'category');
  const inScope = (l: HHLine) => {
    if (rule.scope_type === 'item' && ids.size > 0) return ids.has(norm(l.sku));
    if (rule.scope_type === 'category' && ids.size > 0) return ids.has(norm(l.category));
    return true; // storewide
  };

  let base = 0;
  for (const l of lines) if (inScope(l)) base += l.total;
  if (base <= 0) return { total: 0, bySku: {} };

  const val = rule.discount_value ?? 0;
  let total = 0;
  let label = '';
  switch (rule.discount_type) {
    case 'percentage': total = (base * val) / 100; label = `${trimNum(val)}% off`; break;
    case 'fixed_amount': total = val; label = `${currency} ${trimNum(val)} off`; break;
    case 'fixed_price': total = Math.max(0, base - val); label = `Fixed price ${currency} ${trimNum(val)}`; break;
    default: return { total: 0, bySku: {} };
  }
  if (rule.max_discount && rule.max_discount > 0 && total > rule.max_discount) total = rule.max_discount;
  if (total > base) total = base;

  const bySku: Record<string, HHLineResult> = {};
  if (scoped && total > 0) {
    const totalBySku: Record<string, number> = {};
    for (const l of lines) if (inScope(l)) totalBySku[l.sku] = (totalBySku[l.sku] ?? 0) + l.total;
    for (const [sku, skuTotal] of Object.entries(totalBySku)) {
      if (skuTotal <= 0) continue;
      bySku[sku] = { amount: round2((total * skuTotal) / base), freeQty: 0, type: rule.discount_type, label };
    }
  }
  return { total: round2(total), bySku };
}

function calcBogo(rule: PromotionRule, lines: HHLine[]): { total: number; bySku: Record<string, HHLineResult> } {
  if (rule.scope_type !== 'item' || !(rule.scope_ids ?? []).length) return { total: 0, bySku: {} };
  const buy = Math.max(1, rule.buy_quantity ?? 1);
  const get = Math.max(1, rule.get_quantity ?? 1);
  const pct = (rule.get_discount_percent ?? 100) <= 0 ? 100 : (rule.get_discount_percent ?? 100);
  const label = `Buy ${buy} Get ${get} ${pct < 100 ? `${trimNum(pct)}% off` : 'Free'}`;

  if (rule.get_pair_map && Object.keys(rule.get_pair_map).length > 0) {
    return calcCorrespondingPairBogo(rule, lines, buy, get, pct, label);
  }
  if ((rule.get_scope_ids ?? []).length > 0) {
    return calcCrossItemBogo(rule, lines, buy, get, pct, label);
  }

  const ids = new Set((rule.scope_ids ?? []).map(norm));
  const cycle = buy + get;

  const qtyBySku: Record<string, number> = {};
  const priceBySku: Record<string, number> = {};
  for (const l of lines) {
    if (!ids.has(norm(l.sku))) continue;
    qtyBySku[l.sku] = (qtyBySku[l.sku] ?? 0) + l.quantity;
    priceBySku[l.sku] = l.unitPrice;
  }

  let total = 0;
  const bySku: Record<string, HHLineResult> = {};
  for (const [sku, qty] of Object.entries(qtyBySku)) {
    const pairs = Math.floor(qty / cycle);
    if (pairs <= 0) continue;
    const freeUnits = pairs * get;
    const amt = round2(priceBySku[sku] * freeUnits * (pct / 100));
    total += amt;
    bySku[sku] = { amount: amt, freeQty: freeUnits, type: 'bogo', label };
  }
  if (rule.max_discount && rule.max_discount > 0 && total > rule.max_discount) total = rule.max_discount;
  return { total: round2(total), bySku };
}

/**
 * Cross-item BOGO — "buy one Large pizza, get one Small pizza free". The "get" item is a
 * genuinely different catalog SKU that the cashier adds as its own real cart line (never
 * auto-added — see bogoFreeUnitsForSku), so this only discounts whichever get-scope units are
 * ALREADY in the cart, cheapest-first when multiple different get-scope items are present —
 * mirrors pos-api's calculateCrossItemBOGO exactly.
 */
function calcCrossItemBogo(
  rule: PromotionRule, lines: HHLine[], buy: number, get: number, pct: number, label: string,
): { total: number; bySku: Record<string, HHLineResult> } {
  const buyIds = new Set((rule.scope_ids ?? []).map(norm));
  const getIds = new Set((rule.get_scope_ids ?? []).map(norm));

  let buyTotalQty = 0;
  for (const l of lines) if (buyIds.has(norm(l.sku))) buyTotalQty += l.quantity;
  const pairs = Math.floor(buyTotalQty / buy);
  if (pairs <= 0) return { total: 0, bySku: {} };
  let freeUnitsEarned = pairs * get;

  const units: { sku: string; price: number }[] = [];
  for (const l of lines) {
    if (!getIds.has(norm(l.sku))) continue;
    for (let i = 0; i < l.quantity; i++) units.push({ sku: l.sku, price: l.unitPrice });
  }
  if (units.length === 0) return { total: 0, bySku: {} };
  units.sort((a, b) => a.price - b.price);
  if (freeUnitsEarned > units.length) freeUnitsEarned = units.length;

  let total = 0;
  const bySku: Record<string, HHLineResult> = {};
  for (let i = 0; i < freeUnitsEarned; i++) {
    const u = units[i];
    const amt = round2(u.price * (pct / 100));
    total += amt;
    const existing = bySku[u.sku] ?? { amount: 0, freeQty: 0, type: 'bogo', label };
    existing.amount = round2(existing.amount + amt);
    existing.freeQty += 1;
    bySku[u.sku] = existing;
  }
  if (rule.max_discount && rule.max_discount > 0 && total > rule.max_discount) total = rule.max_discount;
  return { total: round2(total), bySku };
}

/**
 * Corresponding-pair cross-item BOGO — "buy a Large pizza, get the SAME-FLAVOR Small free". Uses
 * rule.get_pair_map (buy SKU → its one specific get SKU) so the freed item is the one that matches
 * what was bought, never an arbitrary/cheapest flavor. For each buy SKU in the cart, every `buy`
 * units earns `get` free units of ITS mapped SKU, capped by how many of that mapped SKU are in the
 * cart (the terminal auto-adds it). Mirrors pos-api's calculateCorrespondingPairBOGO exactly.
 */
function calcCorrespondingPairBogo(
  rule: PromotionRule, lines: HHLine[], buy: number, get: number, pct: number, label: string,
): { total: number; bySku: Record<string, HHLineResult> } {
  const pairMap = rule.get_pair_map ?? {};
  const pair: Record<string, string> = {}; // lower(buySku) -> getSku (original case)
  for (const [k, v] of Object.entries(pairMap)) pair[norm(k)] = v;
  if (Object.keys(pair).length === 0) return { total: 0, bySku: {} };

  const buyQtyBySku: Record<string, number> = {};
  for (const l of lines) {
    const lk = norm(l.sku);
    if (pair[lk] !== undefined) buyQtyBySku[lk] = (buyQtyBySku[lk] ?? 0) + l.quantity;
  }

  const getUnits: Record<string, number[]> = {};   // lower(getSku) -> remaining unit prices
  const getDisplaySku: Record<string, string> = {}; // lower(getSku) -> original-case sku
  for (const l of lines) {
    const gk = norm(l.sku);
    for (let i = 0; i < l.quantity; i++) (getUnits[gk] ??= []).push(l.unitPrice);
    getDisplaySku[gk] = l.sku;
  }

  let total = 0;
  const freeQtyBySku: Record<string, number> = {};
  const amtBySku: Record<string, number> = {};
  for (const [buyLk, qty] of Object.entries(buyQtyBySku)) {
    const pairs = Math.floor(qty / buy);
    if (pairs <= 0) continue;
    const earned = pairs * get;
    const gk = norm(pair[buyLk]);
    const avail = (getUnits[gk] ?? []).slice().sort((a, b) => a - b);
    const n = Math.min(earned, avail.length);
    for (let i = 0; i < n; i++) {
      const amt = round2(avail[i] * (pct / 100));
      total += amt;
      freeQtyBySku[gk] = (freeQtyBySku[gk] ?? 0) + 1;
      amtBySku[gk] = round2((amtBySku[gk] ?? 0) + amt);
    }
    getUnits[gk] = avail.slice(n); // consume freed units
  }

  const bySku: Record<string, HHLineResult> = {};
  for (const gk of Object.keys(freeQtyBySku)) {
    bySku[getDisplaySku[gk]] = { amount: amtBySku[gk], freeQty: freeQtyBySku[gk], type: 'bogo', label };
  }
  if (rule.max_discount && rule.max_discount > 0 && total > rule.max_discount) total = rule.max_discount;
  return { total: round2(total), bySku };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * BOGO auto-add: for a SAME-SKU "Buy B Get G" item, how many FREE (or discounted-"get") units
 * to add to the cart for a given PAID quantity. Returns 0 for non-BOGO promos, unscoped items,
 * AND cross-item BOGO rules (get_scope_ids set) — a cross-item deal's "get" item is a genuinely
 * DIFFERENT catalog item (e.g. buy a Large pizza, get a Small pizza free) that the cashier must
 * explicitly add themselves; auto-adding it would pick an arbitrary flavor/size on their behalf.
 * calcCrossItemBogo instead discounts whichever get-scope item the cashier actually added.
 * The added units (same-SKU case) are then priced by the standard BOGO discount
 * (get_discount_percent) so a 100%-off deal makes them free and a <100% deal charges the
 * reduced rate — and because the cart line quantity now includes them, stock deducts paid+free
 * automatically.
 */
export function bogoFreeUnitsForSku(sku: string, paidQty: number, promos: HappyHourPromotion[]): number {
  if (paidQty <= 0) return 0;
  const s = norm(sku);
  const owners = bogoOwners(promos);
  let best = 0;
  for (const p of promos) {
    const r = p.rule;
    if (!r || r.discount_type !== 'bogo' || r.scope_type !== 'item') continue;
    if ((r.get_scope_ids ?? []).length > 0) continue; // cross-item — never auto-add
    if (!(r.scope_ids ?? []).map(norm).includes(s)) continue;
    if (!ownsBuySku(p, s, owners)) continue; // a newer deal owns this item
    const buy = Math.max(1, r.buy_quantity ?? 1);
    const get = Math.max(1, r.get_quantity ?? 1);
    const free = Math.floor(paidQty / buy) * get;
    if (free > best) best = free;
  }
  return best;
}

/**
 * Combined happy-hour discount for the cart. ALL active promos STACK — each discounts its own
 * scoped items, summed — mirroring pos-api's combineTimedDiscounts. A SKU covered by two promos
 * takes only the better one (no double-dip), and a "buy X get Y" deal never earns from an item a
 * newer deal owns (bogoOwners); storewide/unattributed discounts add on top. This
 * replaces the old "single best promo wins" behaviour that dropped every deal but the largest on an
 * order carrying items from two promotions (e.g. a cocktail deal + a pizza deal on one docket).
 */
export function computeHappyHour(lines: HHLine[], promos: HappyHourPromotion[], currency = 'KES'): HappyHourResult {
  const combined: Record<string, HHLineResult> = {};
  const names: string[] = [];
  let storewide = 0;
  const owners = bogoOwners(promos);
  for (const p of newestFirst(promos)) {
    if (!p.rule) continue;
    // A BOGO deal only earns from the buy items no newer deal owns.
    const buy = bogoBuySkus(p.rule);
    const own = buy.size === 0 ? lines : lines.filter((l) => !buy.has(norm(l.sku)) || ownsBuySku(p, l.sku, owners));
    const r = evalRule(p.rule, own, currency);
    if (r.total <= 0) continue;
    const skus = Object.keys(r.bySku);
    let contributed = false;
    if (skus.length > 0) {
      for (const sku of skus) {
        const ld = r.bySku[sku];
        const existing = combined[sku];
        if (!existing || ld.amount > existing.amount) {
          combined[sku] = ld; // better promo claims this SKU; no double-dip
          contributed = true;
        }
      }
    } else {
      storewide += r.total; // storewide/unattributed — adds additively
      contributed = true;
    }
    if (contributed && !names.includes(p.name)) names.push(p.name);
  }
  let total = storewide;
  for (const sku of Object.keys(combined)) total += combined[sku].amount;
  total = round2(total);
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  if (total > subtotal) total = subtotal;
  return { total, promoName: names.join(' + '), bySku: combined };
}
