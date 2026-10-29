// Variant (size, colour, ...) rules for the till, in one place. Each variant is its own
// inventory item (a child of the display product) with its own id, SKU, barcode, price and
// stock, so a variant cart line IS that child item: pos-api, inventory, tax and eTIMS all key on
// the child, and pos-api stamps the metadata.variant snapshot on the line server side.
// Pure functions only (run by node-tests/variants.test.ts).

import type { ItemVariant, MenuItem } from '@/components/pos/terminal/terminal-context';

/** Axis order shared with inventory-api's variant names ("T-shirt, Red / M"): colour, then
 *  size, then any other axis alphabetically. */
function axisRank(axis: string): number {
  const a = axis.toLowerCase();
  if (a === 'colour' || a === 'color') return 0;
  if (a === 'size') return 1;
  return 2;
}

/** Axis names across the variants, in display order. */
export function variantAxes(variants: ItemVariant[]): string[] {
  const seen = new Set<string>();
  for (const v of variants) for (const k of Object.keys(v.attributes ?? {})) if (k) seen.add(k);
  return [...seen].sort((a, b) => axisRank(a) - axisRank(b) || a.localeCompare(b));
}

/** Values of one axis in first-seen order. */
export function axisValues(variants: ItemVariant[], axis: string): string[] {
  const out: string[] = [];
  for (const v of variants) {
    const val = v.attributes?.[axis];
    if (val && !out.includes(val)) out.push(val);
  }
  return out;
}

/** The variant carrying exactly these values (every given axis must match). */
export function findVariant(variants: ItemVariant[], want: Record<string, string>): ItemVariant | undefined {
  return variants.find((v) => Object.entries(want).every(([k, val]) => v.attributes?.[k] === val));
}

/** "Red / M" in axis order, falling back to the variant name. */
export function variantLabel(v: ItemVariant): string {
  const attrs = v.attributes ?? {};
  const parts = variantAxes([v]).map((k) => attrs[k]).filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : v.name;
}

/** Cart line name: the child's own name when it already names the product ("T-shirt, Red / M"),
 *  else "<product>, <variant>". */
export function variantLineName(item: Pick<MenuItem, 'name'>, v: ItemVariant): string {
  if (v.name && v.name.toLowerCase().startsWith(item.name.toLowerCase())) return v.name;
  return `${item.name}, ${variantLabel(v)}`;
}

/**
 * The cart line for a chosen variant. Its id is the child item id (a real catalog item, so
 * pos-api accepts it as catalog_item_id; the old "<item>::<variant>" id was rejected with a 400),
 * and its SKU, barcode, price, image and stock are the child's. The parent's price guardrails are
 * dropped: they belong to the parent, and pos-api enforces the child's own at sale.
 */
export function variantLineItem(item: MenuItem, v: ItemVariant): MenuItem {
  return {
    ...item,
    id: v.id,
    name: variantLineName(item, v),
    sku: v.sku || item.sku,
    barcode: v.barcode,
    price: v.price,
    prices: undefined,
    priceIsFallback: undefined,
    minSellingPrice: undefined,
    maxSellingPrice: undefined,
    image: v.imageUrl || item.image,
    stockQuantity: v.onHand ?? undefined,
    hasVariants: false,
    variants: undefined,
  };
}

/** A scanned or typed code matched against the variants carried by catalog parents (the
 *  catalog list hides children under their parent, so a child's barcode or SKU lives only here). */
export function findVariantByScanCode(
  items: MenuItem[],
  raw: string,
): { item: MenuItem; variant: ItemVariant } | undefined {
  const code = raw.trim().toLowerCase();
  if (!code) return undefined;
  for (const item of items) {
    for (const v of item.variants ?? []) {
      if ((v.sku ?? '').toLowerCase() === code || (v.barcode ?? '').toLowerCase() === code) {
        return { item, variant: v };
      }
    }
  }
  return undefined;
}
