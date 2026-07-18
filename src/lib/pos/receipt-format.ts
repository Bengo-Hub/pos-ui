/**
 * Receipt layout resolution — the client mirror of pos-api's printing/layouts registry
 * (`layouts.Resolve`). The server resolves the outlet's receipt_format setting and stamps
 * the result on the receipt JSON as `layout`; this helper is the SINGLE client-side
 * decision point that (a) prefers that server-resolved value and (b) falls back safely
 * for offline-cached payloads that predate the field.
 *
 * Layout ids (keep in sync with pos-api internal/modules/printing/layouts/registry.go):
 *  - thermal_classic — receipt-roll layout, bold monospace (classic hospitality look)
 *  - thermal_modern  — receipt-roll layout, bold sans-serif (crisp retail/ETR look)
 *  - a4_invoice      — boxed invoice-style A4 sheet (opt-in via settings)
 */
export type ReceiptLayout = 'thermal_classic' | 'thermal_modern' | 'a4_invoice';

const KNOWN_LAYOUTS: ReceiptLayout[] = ['thermal_classic', 'thermal_modern', 'a4_invoice'];

/** Minimal shape needed for resolution (subset of ReceiptData). */
interface ReceiptLayoutSource {
  layout?: string;
  use_case?: string;
}

/**
 * Resolve the layout to render a receipt with.
 * Priority: server-resolved `receipt.layout` → outlet settings `receipt_format` (cached,
 * for offline payloads predating the field) → thermal by use case (modern for retail,
 * classic otherwise). NEVER A4 unless explicitly configured — thermal is the layout that
 * prints crisp on receipt printers, and A4 through the browser was the root cause of the
 * "receipt iko vibaya ukiprint" complaint.
 */
export function resolveReceiptFormat(
  receipt: ReceiptLayoutSource | null | undefined,
  settingFormat?: string | null,
): ReceiptLayout {
  const fromReceipt = receipt?.layout as ReceiptLayout | undefined;
  if (fromReceipt && KNOWN_LAYOUTS.includes(fromReceipt)) return fromReceipt;
  const fromSetting = settingFormat as ReceiptLayout | undefined;
  if (fromSetting && KNOWN_LAYOUTS.includes(fromSetting)) return fromSetting;
  return receipt?.use_case === 'retail' ? 'thermal_modern' : 'thermal_classic';
}

/** Paper geometry for a layout — drives the print-window @page shell. */
export function paperForFormat(layout: ReceiptLayout): 'thermal' | 'a4' {
  return layout === 'a4_invoice' ? 'a4' : 'thermal';
}

/** True when the layout renders on receipt-roll geometry. */
export function isThermalFormat(layout: ReceiptLayout): boolean {
  return layout !== 'a4_invoice';
}
