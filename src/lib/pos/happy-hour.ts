/**
 * Client-side happy-hour discount calculator — mirrors pos-api
 * internal/modules/promotions/service.go (evaluateRule + calculateBOGODiscount) so the terminal
 * can show the auto-applied deal LIVE (discount line + per-item badge) before the order is
 * placed. The server recomputes authoritatively at checkout, so the two must agree.
 */
import type { HappyHourPromotion, PromotionRule } from '@/lib/api/hotel';

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

function evalRule(rule: PromotionRule, lines: HHLine[]): { total: number; bySku: Record<string, HHLineResult> } {
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
    case 'fixed_amount': total = val; label = `KES ${trimNum(val)} off`; break;
    case 'fixed_price': total = Math.max(0, base - val); label = `Fixed price KES ${trimNum(val)}`; break;
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
  const ids = new Set((rule.scope_ids ?? []).map(norm));
  const buy = Math.max(1, rule.buy_quantity ?? 1);
  const get = Math.max(1, rule.get_quantity ?? 1);
  const pct = (rule.get_discount_percent ?? 100) <= 0 ? 100 : (rule.get_discount_percent ?? 100);
  const cycle = buy + get;

  const qtyBySku: Record<string, number> = {};
  const priceBySku: Record<string, number> = {};
  for (const l of lines) {
    if (!ids.has(norm(l.sku))) continue;
    qtyBySku[l.sku] = (qtyBySku[l.sku] ?? 0) + l.quantity;
    priceBySku[l.sku] = l.unitPrice;
  }
  const label = `Buy ${buy} Get ${get} ${pct < 100 ? `${trimNum(pct)}% off` : 'Free'}`;

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

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * BOGO auto-add: for a "Buy B Get G" item, how many FREE (or discounted-"get") units to add
 * to the cart for a given PAID quantity. Returns 0 for non-BOGO promos or unscoped items.
 * The added units are then priced by the standard BOGO discount (get_discount_percent) so a
 * 100%-off deal makes them free and a <100% deal charges the reduced rate — and because the
 * cart line quantity now includes them, stock deducts paid+free automatically.
 */
export function bogoFreeUnitsForSku(sku: string, paidQty: number, promos: HappyHourPromotion[]): number {
  if (paidQty <= 0) return 0;
  const s = norm(sku);
  let best = 0;
  for (const p of promos) {
    const r = p.rule;
    if (!r || r.discount_type !== 'bogo' || r.scope_type !== 'item') continue;
    if (!(r.scope_ids ?? []).map(norm).includes(s)) continue;
    const buy = Math.max(1, r.buy_quantity ?? 1);
    const get = Math.max(1, r.get_quantity ?? 1);
    const free = Math.floor(paidQty / buy) * get;
    if (free > best) best = free;
  }
  return best;
}

/** Best auto-apply happy-hour discount for the cart (highest total across active promos). */
export function computeHappyHour(lines: HHLine[], promos: HappyHourPromotion[]): HappyHourResult {
  let best: HappyHourResult = { total: 0, promoName: '', bySku: {} };
  for (const p of promos) {
    if (!p.rule) continue;
    const r = evalRule(p.rule, lines);
    if (r.total > best.total) best = { total: r.total, promoName: p.name, bySku: r.bySku };
  }
  return best;
}
