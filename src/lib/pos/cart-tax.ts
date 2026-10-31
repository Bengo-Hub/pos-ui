/**
 * Per-item cart tax — the source of truth for how the POS terminal computes tax.
 *
 * Tax is owned by TREASURY and enriched onto each inventory item (tax_rate / tax_inclusive),
 * surfaced through pos-api's catalog and carried on each cart line. The terminal therefore
 * applies EACH line's own tax instead of stacking a single flat outlet rate over the whole cart.
 *
 * Semantics (mirrors inventory-api ComputeTaxSplit):
 *   - tax-INCLUSIVE line: `price` ALREADY contains tax. We do NOT add tax on top — the line's tax
 *     is the embedded portion gross - gross/(1+rate). Its contribution to the order total is the
 *     gross price unchanged. This is what eliminates the historical double-tax.
 *   - tax-EXCLUSIVE line with a rate: add that line's own rate → tax = gross * rate; total
 *     contribution = gross + tax.
 *   - line with NO treasury tax info (legacy items): fall back to the outlet/posSettings flat rate,
 *     treated as exclusive, so legacy carts behave exactly as before.
 *
 * `subtotal` is always the sum of gross line prices (what is rung up / shown on item cards). The
 * returned `tax` is the ADDED tax (exclusive lines + legacy fallback only — inclusive lines add 0).
 * `total = subtotal + tax`. Inclusive lines never inflate the total.
 */

import { roundMoney, splitTax } from '@bengo-hub/shared-ui-lib/tax';

export interface CartTaxLine {
  /** Gross line amount as rung up: (unit price + modifier total) * quantity. */
  gross: number;
  /** Per-item VAT rate (%), e.g. 16. undefined → no treasury info → use the fallback rate. */
  taxRate?: number;
  /** When true the gross already includes tax (do not add on top). */
  taxInclusive?: boolean;
}

export interface CartTaxResult {
  /** Sum of gross line prices. */
  subtotal: number;
  /** Tax ADDED to the order (exclusive + legacy-fallback lines). Inclusive lines contribute 0 here. */
  tax: number;
  /** Tax embedded inside inclusive lines (informational — already part of subtotal/total). */
  inclusiveTax: number;
  /** subtotal + tax (added tax only). */
  total: number;
}

/**
 * computeCartTax aggregates per-line tax.
 * @param lines      cart lines with gross + per-item tax fields
 * @param fallbackRatePct flat outlet VAT % (from posSettings) applied ONLY to legacy lines with no tax info
 */
export function computeCartTax(lines: CartTaxLine[], fallbackRatePct: number): CartTaxResult {
  let subtotal = 0;
  let addedTax = 0;
  let inclusiveTax = 0;

  for (const line of lines) {
    const gross = roundMoney(line.gross);
    subtotal += gross;

    const hasInfo = typeof line.taxRate === 'number';
    const ratePct = hasInfo ? (line.taxRate as number) : fallbackRatePct;
    if (ratePct <= 0) continue;

    // VAT is rounded on each line with the platform's shared calculator, exactly as pos-api's
    // ComputeLineTax does, so the till and the stored order agree to the cent.
    const { tax } = splitTax(gross, ratePct, !!line.taxInclusive);
    if (line.taxInclusive) {
      inclusiveTax += tax; // already inside the gross; adds nothing to the total
    } else {
      addedTax += tax;
    }
  }

  // The single whole-number rounding of the payable happens once at the order level (applyRoundOff).
  const tax = roundMoney(addedTax);
  const sub = roundMoney(subtotal);
  return {
    subtotal: sub,
    tax,
    inclusiveTax: roundMoney(inclusiveTax),
    total: roundMoney(sub + tax),
  };
}

/** round2 normalizes a float to 2 decimal places, half away from zero (money components). */
export function round2(n: number): number {
  return roundMoney(n);
}

export interface RoundOffResult {
  /** Amount added to reach the next whole number (0 <= roundOff < 1). */
  roundOff: number;
  /** ceil(raw) — the whole-number payable. */
  total: number;
}

/**
 * applyRoundOff rounds an order's raw payable UP to the next whole number (QA: POS totals
 * have no decimal points), returning the added `roundOff` so receipts/orders can show it as
 * an explicit component: total = raw + roundOff. Mirrors pos-api orders.finalizeTotals —
 * the server recomputes the same math, so till total == stored total.
 */
export function applyRoundOff(rawTotal: number): RoundOffResult {
  const raw = round2(Math.max(0, rawTotal));
  const total = Math.ceil(raw);
  return { roundOff: round2(total - raw), total };
}
