/**
 * Shared receipt row builder — the single place that decides WHICH rows a receipt shows, in WHAT
 * order, with WHAT labels/values. `receipt-preview.tsx` (on-screen Tailwind card) and
 * `receipt-print.tsx` (thermal/print HTML) both map over this same list instead of each
 * re-deriving it independently, so the two can never drift on content/order/labels — only the
 * visual skin (card vs. thermal paper) differs between them.
 */
import type { ReceiptData } from '@/components/pos/receipt-preview';

export interface ReceiptLineRow {
  kind: 'line';
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  free: boolean;
  modifiers?: string;
}
export interface ReceiptDividerRow { kind: 'divider' }
export interface ReceiptMoneyRow { kind: 'money'; label: string; amount: number; negative?: boolean }
export interface ReceiptTotalRow { kind: 'total'; label: string; amount: number }
/** Plain label:value count (Total Quantity / TOTAL ITEMS) — NOT currency, so no formatCurrency. */
export interface ReceiptCountRow { kind: 'count'; label: string; value: string }
export interface ReceiptPaymentRow { kind: 'payment'; label: string; amount: number }
export interface ReceiptChangeRow { kind: 'change'; amount: number }
export interface ReceiptEtimsRow {
  kind: 'etims';
  invoiceNumber: string;
  /** Data: URI of the server-rendered QR — NEVER the raw verification link (that's not an image). */
  qrUrl?: string;
  cuInvNo?: string;
  scuId?: string;
  // Deliberately no signature field: the receipt signature is already encoded in the QR;
  // printing it in the clear is an avoidable exposure of KRA-issued fiscal proof. The KRA
  // PIN is shown in the receipt HEADER (top), not this bottom fiscal block — mirrors the
  // KRA-issued paper ETR receipt layout.
}
export interface ReceiptHowToPayTitleRow { kind: 'how-to-pay-title' }
export interface ReceiptPaymentMethodRow { kind: 'payment-method'; label: string; value: string }
export interface ReceiptPaymentAccountNameRow { kind: 'payment-account-name'; text: string }
export interface ReceiptServedByRow { kind: 'served-by'; name: string }
export interface ReceiptCustomerRow { kind: 'customer'; label: string; name: string }
export interface ReceiptFooterRow { kind: 'footer'; text: string }
export interface ReceiptProviderRow { kind: 'provider'; lead: string; contact: string }
/** Code 128 of the order number (retail receipts) — src is a data: URI from pos-api. */
export interface ReceiptBarcodeRow { kind: 'barcode'; src: string; text: string }

export type ReceiptRow =
  | ReceiptLineRow
  | ReceiptDividerRow
  | ReceiptMoneyRow
  | ReceiptCountRow
  | ReceiptTotalRow
  | ReceiptPaymentRow
  | ReceiptChangeRow
  | ReceiptEtimsRow
  | ReceiptHowToPayTitleRow
  | ReceiptPaymentMethodRow
  | ReceiptPaymentAccountNameRow
  | ReceiptServedByRow
  | ReceiptCustomerRow
  | ReceiptFooterRow
  | ReceiptProviderRow
  | ReceiptBarcodeRow;

/** Static fallback for the platform-owner advertisement, mirroring pos-api's DefaultProviderFooter. */
const PROVIDER_FOOTER_FALLBACK = {
  lead: 'Developed & maintained by Codevertex Africa Limited',
  contact: 'www.codevertexafrica.com  ·  info@codevertexafrica.com  ·  +254 742 201 368',
};

/** Builds the ordered receipt body: items → totals → payment → eTIMS → HOW TO PAY → served-by →
 *  footer. Excludes the top branding block (logo/tenant/outlet name/address), which callers render
 *  directly from plain string props — those don't need derivation and carry no drift risk. */
export function buildReceiptRows(receipt: ReceiptData): ReceiptRow[] {
  const rows: ReceiptRow[] = [];

  // Customer / payer line (name keyed in at sale, online-payment payer, or Walk-in customer).
  if (receipt.bill_to) {
    rows.push({ kind: 'customer', label: receipt.bill_to_label || 'Customer', name: receipt.bill_to });
    rows.push({ kind: 'divider' });
  }

  for (const line of receipt.lines) {
    rows.push({
      kind: 'line',
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      total: line.total_price,
      free: line.total_price === 0,
      modifiers: line.modifiers,
    });
  }

  rows.push({ kind: 'divider' });
  // Item-count summary (Total Quantity = summed units across all lines, TOTAL ITEMS = line
  // count) — label casing/order matches receipt-retail-print.tsx and pos-api's
  // a4_pdf.go/a4_html.go/thermal_pdf.go/thermal_html.go/escpos.go exactly, so every receipt
  // surface agrees.
  if (receipt.lines.length > 0) {
    const totalQty = receipt.lines.reduce((s, l) => s + l.quantity, 0);
    rows.push({ kind: 'count', label: 'Total Quantity', value: String(totalQty) });
    rows.push({ kind: 'count', label: 'TOTAL ITEMS', value: String(receipt.lines.length) });
  }
  rows.push({ kind: 'money', label: 'Subtotal', amount: receipt.subtotal });
  if (receipt.vat_enabled !== false && receipt.tax_amount > 0) {
    rows.push({ kind: 'money', label: `VAT (${receipt.vat_rate ?? 16}%)`, amount: receipt.tax_amount });
  }
  if (receipt.discount_amount > 0) {
    rows.push({ kind: 'money', label: 'Discount', amount: receipt.discount_amount, negative: true });
  }
  // Itemised charges (Shipping(+)/Packaging(+)/…) when the named breakdown is available;
  // one aggregate row otherwise.
  const chargeEntries = Object.entries(receipt.charges ?? {}).filter(([, v]) => v > 0);
  if (chargeEntries.length > 0) {
    for (const [key, amount] of chargeEntries.sort(([a], [b]) => a.localeCompare(b))) {
      rows.push({ kind: 'money', label: `${key.charAt(0).toUpperCase()}${key.slice(1)}(+)`, amount });
    }
  } else if ((receipt.charges_total ?? 0) > 0) {
    rows.push({ kind: 'money', label: 'Charges', amount: receipt.charges_total ?? 0 });
  }
  if ((receipt.round_off ?? 0) > 0) {
    rows.push({ kind: 'money', label: 'Round Off', amount: receipt.round_off ?? 0 });
  }
  // "REFUND TOTAL" on a return/refund document, "TOTAL" on a sale — mirrors pos-api's
  // layouts.totalLabel so the client-printed slip matches the server HTML/PDF exactly.
  rows.push({ kind: 'total', label: receipt.is_return ? 'REFUND TOTAL' : 'TOTAL', amount: receipt.total_amount });
  // Payment method — with the settle date beside it ("cash (14-07-2026)") when known.
  const methodLabel = (receipt.payment_method ?? 'cash').replace(/_/g, ' ');
  const paymentDate = receipt.payment_date
    ? ` (${new Date(receipt.payment_date).toLocaleDateString('en-GB').replace(/\//g, '-')})`
    : '';
  rows.push({ kind: 'payment', label: `${methodLabel}${paymentDate}`, amount: receipt.amount_tendered });
  if (receipt.change_due > 0) {
    rows.push({ kind: 'change', amount: receipt.change_due });
  }
  // Outstanding balance (on-account/credit sale) or customer credit (negative) — states what is
  // still owed after this payment, like the "Total Due with Current" line on the retail design.
  if (Math.abs(receipt.balance_due ?? 0) >= 0.005) {
    rows.push({ kind: 'money', label: 'Balance Due', amount: receipt.balance_due ?? 0 });
  }
  // Customer's OVERALL treasury account position (store credit or amount owing) — distinct from
  // balance_due above, which is scoped to this one order. Shown regardless of this sale's tender.
  if (receipt.customer_account_balance != null) {
    rows.push({
      kind: 'money',
      label: receipt.customer_account_balance_label ?? 'Account Balance',
      amount: receipt.customer_account_balance,
    });
  }

  const pm = receipt.payment_methods;
  if (pm && Object.values(pm).some(Boolean)) {
    rows.push({ kind: 'divider' });
    rows.push({ kind: 'how-to-pay-title' });
    if (pm.mpesa_paybill) rows.push({ kind: 'payment-method', label: 'M-PESA Paybill', value: pm.mpesa_paybill });
    if (pm.mpesa_account_reference) rows.push({ kind: 'payment-method', label: 'Account No.', value: pm.mpesa_account_reference });
    if (pm.mpesa_till) rows.push({ kind: 'payment-method', label: 'M-PESA Till', value: pm.mpesa_till });
    if (pm.mpesa_pochi) rows.push({ kind: 'payment-method', label: 'M-PESA Pochi', value: pm.mpesa_pochi });
    if (pm.bank_account_number) rows.push({ kind: 'payment-method', label: pm.bank_name || 'Bank', value: pm.bank_account_number });
    if (pm.bank_account_name) rows.push({ kind: 'payment-account-name', text: pm.bank_account_name });
  }

  if (receipt.served_by) {
    rows.push({ kind: 'served-by', name: receipt.served_by });
  }

  // KRA eTIMS fiscal block — adapted from the KRA-issued paper ETR receipt (see the Jazaribu
  // Retail reference): SCU ID + CU Inv No, then the verification QR, then — right after, no
  // other content between — the fiscal barcode (same adjacency as a genuine ETR receipt).
  // Shown when ANY fiscal identity has landed (CU inv no / invoice number), so a compliant
  // strip renders even before the legacy invoice_number populates.
  if (receipt.etims_invoice_number || receipt.etims_cu_inv_no) {
    rows.push({ kind: 'divider' });
    rows.push({
      kind: 'etims',
      invoiceNumber: receipt.etims_invoice_number ?? '',
      // The QR is ALWAYS the server-rendered image (etims_qr_png) — the verification LINK
      // (etims_qr_code_url) is never a valid <img src> and must not be used as one.
      qrUrl: receipt.etims_qr_png,
      cuInvNo: receipt.etims_cu_inv_no,
      scuId: receipt.etims_scu_id,
    });
  }

  // Fiscal barcode: the eTIMS CU Invoice Number once fiscalised, else the order number for
  // non-fiscalised retail sales (server-computed barcode_value — one decision, every surface).
  if (receipt.barcode_png) {
    rows.push({ kind: 'barcode', src: receipt.barcode_png, text: receipt.barcode_value || receipt.order_number });
  }

  rows.push({ kind: 'footer', text: receipt.receipt_footer || 'Thank you for your business!' });

  // Platform-owner (Codevertex) advertisement — platform default ON, per-tenant opt-out.
  // Undefined (older/offline-cached payloads) is treated as "show", matching show_logo's
  // convention, so an unrelated pos-api rollout never silently drops the ad by default.
  if (receipt.show_provider_footer !== false) {
    rows.push({
      kind: 'provider',
      lead: receipt.provider_footer_lead || PROVIDER_FOOTER_FALLBACK.lead,
      contact: receipt.provider_footer_contact || PROVIDER_FOOTER_FALLBACK.contact,
    });
  }

  return rows;
}
