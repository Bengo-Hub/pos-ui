/**
 * Shared, pure auto-apply-discount helpers extracted from the POS terminal
 * (components/pos/terminal/terminal-context.tsx) so the terminal AND Add Sale
 * (app/[orgSlug]/sell/add/page.tsx) run the SAME logic instead of two independently
 * maintained copies that could drift. This module owns no React state — callers keep
 * owning their own cart state and fire their own toasts from what these functions return.
 *
 * Pairs with the existing pure calculators in lib/pos/happy-hour.ts (computeHappyHour,
 * bogoFreeUnitsForSku) — those price the deal; this module decides WHICH cart lines a
 * corresponding-pair BOGO auto-adds and WHAT to tell the cashier when an item they just
 * added is covered by a live deal.
 */
import type { Discount as HappyHourPromotion } from '@/lib/api/discounts';

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

/** The one active promo (if any) covering a SKU — on either side of a cross-item pairing. */
export function findPromoForSku(sku: string, activeHappyHours: HappyHourPromotion[]): HappyHourPromotion | undefined {
  return activeHappyHours.find((p) => {
    const r = p.rule;
    if (!r) return false;
    if (r.scope_type === 'all') return true;
    if (r.scope_type !== 'item') return false;
    return (r.scope_ids ?? []).includes(sku) || (r.get_scope_ids ?? []).includes(sku);
  });
}

/** Minimal shape computePairAutoAdd needs from a cart line — CartItem and (via an adapter) a
 *  sell/add SaleLine both satisfy this. */
export interface PairAutoAddLine {
  sku: string;
  name: string;
  quantity: number;
  promoFree?: boolean;
}

export interface PairAutoAddResult<T> {
  changed: boolean;
  next: T[];
  announcements: { sku: string; name: string; qty: number }[];
}

/**
 * Corresponding-pair BOGO auto-add + sync: when a "buy" item (e.g. a Large pizza) is in the cart
 * during an active pair deal, its mapped free item (the matching Small) should be auto-added as
 * its own line with quantity kept in lockstep with the buy line — add/increase/remove the buy
 * item and the free line follows; remove it and the free line goes too. A manually-added "get"
 * item counts toward the earned free units so it's never doubled. Generic over the caller's own
 * cart-line type T so both the terminal's CartItem and Add Sale's SaleLine can reuse this exact
 * computation without either owning the other's state shape.
 */
export function computePairAutoAdd<T extends PairAutoAddLine>(
  cart: T[],
  activeHappyHours: HappyHourPromotion[],
  resolveNewLine: (sku: string) => Omit<T, 'quantity' | 'promoFree'> | undefined,
): PairAutoAddResult<T> {
  const pairRules = activeHappyHours
    .map((p) => p.rule)
    .filter((r): r is NonNullable<typeof r> =>
      !!r && r.discount_type === 'bogo' && r.scope_type === 'item'
      && !!r.get_pair_map && Object.keys(r.get_pair_map).length > 0);

  if (pairRules.length === 0) {
    const hasFree = cart.some((c) => c.promoFree);
    return { changed: hasFree, next: hasFree ? cart.filter((c) => !c.promoFree) : cart, announcements: [] };
  }

  // lower(buySku) -> { getSku, buy, get }; first active rule wins on a conflicting key. A
  // self-mapped entry (buySku === getSku) is skipped — the backend rejects this shape on write
  // (handlers.validateGetPairMap) and its evaluator skips it too, but this mirrors that guard
  // client-side so a pre-existing bad row can't also make the terminal auto-add/announce a
  // "free" line for the very item that earned the credit (the Urban Loft "BURGER DAY" bug).
  const pair = new Map<string, { getSku: string; buy: number; get: number }>();
  for (const r of pairRules) {
    const buy = Math.max(1, r.buy_quantity ?? 1);
    const get = Math.max(1, r.get_quantity ?? 1);
    for (const [bk, gk] of Object.entries(r.get_pair_map ?? {})) {
      const key = bk.toLowerCase();
      if (key === norm(gk)) continue;
      if (!pair.has(key)) pair.set(key, { getSku: gk, buy, get });
    }
  }

  // Earned free units per get SKU, from buy-line quantities (real lines only, not free lines).
  const buyQtyBySku = new Map<string, number>();
  for (const c of cart) {
    if (c.promoFree) continue;
    const k = norm(c.sku);
    if (pair.has(k)) buyQtyBySku.set(k, (buyQtyBySku.get(k) ?? 0) + c.quantity);
  }
  const earnedByGetSku = new Map<string, number>();
  for (const [bk, q] of buyQtyBySku) {
    const info = pair.get(bk)!;
    const earned = Math.floor(q / info.buy) * info.get;
    if (earned <= 0) continue;
    const gk = norm(info.getSku);
    earnedByGetSku.set(gk, (earnedByGetSku.get(gk) ?? 0) + earned);
  }
  // Manually-present (non-free) quantity of each earned get SKU — don't auto-add on top of it.
  const manualByGetSku = new Map<string, number>();
  for (const c of cart) {
    if (c.promoFree) continue;
    const k = norm(c.sku);
    if (earnedByGetSku.has(k)) manualByGetSku.set(k, (manualByGetSku.get(k) ?? 0) + c.quantity);
  }
  const targetAuto = new Map<string, number>();
  for (const [gk, earned] of earnedByGetSku) {
    targetAuto.set(gk, Math.max(0, earned - (manualByGetSku.get(gk) ?? 0)));
  }

  // Rebuild: keep real lines; set each free line to its target (drop at 0); add missing free lines.
  const next: T[] = [];
  const seen = new Set<string>();
  const announcements: { sku: string; name: string; qty: number }[] = [];
  let changed = false;
  for (const c of cart) {
    if (!c.promoFree) { next.push(c); continue; }
    const gk = norm(c.sku);
    const want = targetAuto.get(gk) ?? 0;
    seen.add(gk);
    if (want <= 0) { changed = true; continue; }
    if (c.quantity !== want) {
      if (want > c.quantity) announcements.push({ sku: gk, name: c.name, qty: want });
      next.push({ ...c, quantity: want });
      changed = true;
    } else {
      next.push(c);
    }
  }
  for (const [gk, want] of targetAuto) {
    if (want <= 0 || seen.has(gk)) continue;
    const base = resolveNewLine(gk);
    if (!base) continue; // not in catalog — can't auto-add
    next.push({ ...base, quantity: want, promoFree: true } as T);
    announcements.push({ sku: gk, name: base.name, qty: want });
    changed = true;
  }

  return { changed, next, announcements };
}

export interface AutoApplyAnnouncement {
  type: 'success' | 'info';
  message: string;
  toastId: string;
}

/**
 * What to tell the cashier/customer right after `item` was added to the cart and is covered by a
 * live deal — a concrete "add N more" nudge for an in-progress BOGO, or a celebration once the
 * cycle completes, or a plain "X% off" info line for a non-BOGO discount. Returns null when the
 * item isn't covered by any active promo, or when a corresponding-pair BOGO auto-adds its own
 * free line (that announcement comes from computePairAutoAdd instead, so callers shouldn't double
 * up). `totalQtyForSku` is the item's own-SKU quantity across the cart AFTER this add (same-SKU
 * BOGO cycle math); `updatedCart` is the full post-add line list (buy/get tally for cross-item).
 */
export function describeAutoApplyAnnouncement(
  item: { sku: string; name: string },
  updatedCart: { sku: string; quantity: number }[],
  totalQtyForSku: number,
  activeHappyHours: HappyHourPromotion[],
  currency: string,
): AutoApplyAnnouncement | null {
  const promo = findPromoForSku(item.sku, activeHappyHours);
  if (!promo?.rule) return null;
  const r = promo.rule;
  const toastId = `happy-hour-${item.sku}`;

  const hasPairMap = r.discount_type === 'bogo' && !!r.get_pair_map && Object.keys(r.get_pair_map).length > 0;
  if (hasPairMap) return null; // computePairAutoAdd's own announcement covers this case

  const crossItem = r.discount_type === 'bogo' && (r.get_scope_ids ?? []).length > 0;
  if (crossItem) {
    const buyIds = new Set((r.scope_ids ?? []).map(norm));
    const getIds = new Set((r.get_scope_ids ?? []).map(norm));
    const buyQtyInCart = updatedCart.filter((c) => buyIds.has(norm(c.sku))).reduce((s, c) => s + c.quantity, 0);
    const getQtyInCart = updatedCart.filter((c) => getIds.has(norm(c.sku))).reduce((s, c) => s + c.quantity, 0);
    const buy = r.buy_quantity || 1;
    const get = r.get_quantity || 1;
    const freeEarned = Math.floor(buyQtyInCart / buy) * get;
    const dealLabel = r.get_discount_percent >= 100 ? 'Free' : `${r.get_discount_percent}% off`;
    if (buyIds.has(norm(item.sku))) {
      return getQtyInCart > 0 && freeEarned > 0
        ? { type: 'success', message: `🎉 ${promo.name}: ${dealLabel} item applied!`, toastId }
        : { type: 'info', message: `${promo.name}: add a qualifying item to get one ${dealLabel.toLowerCase()}`, toastId };
    }
    if (getIds.has(norm(item.sku))) {
      return freeEarned >= getQtyInCart
        ? { type: 'success', message: `🎉 ${promo.name}: ${item.name} is ${dealLabel.toLowerCase()}!`, toastId }
        : { type: 'info', message: `${promo.name}: buy a qualifying item to unlock ${dealLabel.toLowerCase()} on ${item.name}`, toastId };
    }
    return null;
  }

  if (r.discount_type === 'bogo' && r.scope_type === 'item') {
    const cycle = (r.buy_quantity || 1) + (r.get_quantity || 1);
    const intoCycle = totalQtyForSku % cycle;
    const dealLabel = r.get_discount_percent >= 100 ? 'Free' : `${r.get_discount_percent}% off`;
    if (intoCycle === 0) {
      return { type: 'success', message: `🎉 ${promo.name}: Buy ${r.buy_quantity} Get ${r.get_quantity} ${dealLabel} applied on ${item.name}!`, toastId };
    }
    const remaining = cycle - intoCycle;
    return { type: 'info', message: `${promo.name}: add ${remaining} more ${item.name} to unlock Buy ${r.buy_quantity} Get ${r.get_quantity} ${dealLabel}`, toastId };
  }

  if (r.discount_type !== 'bogo') {
    const deal = r.discount_type === 'percentage' ? `${r.discount_value}% off`
      : r.discount_type === 'fixed_price' ? `fixed price ${currency} ${r.discount_value}`
      : `${currency} ${r.discount_value} off`;
    return { type: 'info', message: `${promo.name}: ${item.name} is ${deal}`, toastId };
  }

  return null;
}
