/**
 * Fractional/decimal-quantity support for cart line entry.
 *
 * Most catalog items are discretely counted (pieces, bottles, packs) — quantity must stay a
 * whole number. A minority are stocked/sold in a continuous unit (a perfume refilled by the
 * ml, produce sold by the kg) where a decimal quantity like 1.5 is not just valid but the
 * normal case. `CatalogItem.unit` (see hooks/usePOS.ts) carries the item's stock-unit
 * abbreviation, synced from inventory-api — this module is the single place that decides
 * whether a given unit is "continuous" (decimal-capable) or "discrete" (whole-number-only),
 * so every quantity input across the terminal/Add-Sale/dialogs stays consistent.
 *
 * Mirrors the dimension table inventory-api's `internal/modules/units/convert.go` treats as
 * continuous (volume/mass/length) — kept as a small local allow-list since pos-ui has no Go
 * import path into that module; extend both together if a new continuous unit is added there.
 */
const FRACTIONAL_UNIT_ABBRS = new Set([
  'ml', 'l', 'cl', 'dl',
  'g', 'kg', 'mg',
  'm', 'cm', 'mm',
]);

export function isFractionalUnit(unit?: string | null): boolean {
  if (!unit) return false;
  return FRACTIONAL_UNIT_ABBRS.has(unit.trim().toLowerCase());
}

/** Round to 2dp and clamp to a sane non-negative value — the shared commit-time normalizer
 *  for any decimal quantity input (mirrors how whole-number inputs floor/clamp today). */
export function normalizeQuantity(raw: number, fractional: boolean): number {
  if (!Number.isFinite(raw)) return fractional ? 0 : 0;
  if (!fractional) return Math.max(0, Math.floor(raw));
  return Math.max(0, Math.round(raw * 100) / 100);
}

/** Parse a quantity input's raw text value the same way everywhere: decimal-aware only when
 *  the line's unit is fractional, otherwise the existing whole-number parse. Returns null for
 *  an unparsable/empty string so callers can keep their existing "ignore invalid input" behavior. */
export function parseQuantityInput(value: string, fractional: boolean): number | null {
  const n = fractional ? parseFloat(value) : parseInt(value, 10);
  if (Number.isNaN(n)) return null;
  return normalizeQuantity(n, fractional);
}
