/**
 * Single choke point for "what business name prints on this receipt" — every client-rendered
 * receipt surface (on-screen preview, thermal print/PDF, retail A4 print) must call
 * `resolveReceiptDisplayName`/`resolveReceiptOutletLine` instead of re-deriving the answer from
 * a tenant-branding context on its own.
 *
 * pos-api's BuildReceiptView (printing/receiptview.go, resolveDisplayName) already decides this
 * once per receipt — tenant name by default, or the outlet's OWN name when a non-HQ outlet has
 * turned off "Show Business Name on Receipt" (HQ outlets always show the tenant name) — and
 * sends the answer as `display_name` on the receipt API response. A prior version of these
 * components ignored that field and instead rendered a `tenantName` prop unconditionally, so the
 * per-outlet toggle had no visible effect anywhere except the server-generated PDF/ESC-POS bytes.
 * Do not reintroduce an independent tenant-name branch here — extend BuildReceiptView server-side
 * and let `display_name` carry the decision.
 */

interface ReceiptBrandingFields {
  display_name?: string;
  outlet_name?: string;
}

/** Falls back to the legacy tenantName prop only for offline-cached receipts predating this field, then to the outlet's own name, so the header is never blank. */
export function resolveReceiptDisplayName(receipt: ReceiptBrandingFields, legacyTenantName?: string): string {
  return receipt.display_name || legacyTenantName || receipt.outlet_name || '';
}

/** The outlet-name line shown under the resolved header — omitted when it would just repeat it. */
export function resolveReceiptOutletLine(outletName: string | undefined, displayName: string): string | undefined {
  if (!outletName) return undefined;
  return outletName.trim().toLowerCase() === displayName.trim().toLowerCase() ? undefined : outletName;
}
