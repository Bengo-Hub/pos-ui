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
export interface ReceiptPaymentRow { kind: 'payment'; label: string; amount: number }
export interface ReceiptChangeRow { kind: 'change'; amount: number }
export interface ReceiptEtimsRow { kind: 'etims'; invoiceNumber: string; qrUrl?: string }
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
  contact: 'www.codevertexitsolutions.com  ·  info@codevertexitsolutions.com  ·  +254 742 201 368',
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
  rows.push({ kind: 'total', label: 'TOTAL', amount: receipt.total_amount });
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

  if (receipt.etims_invoice_number) {
    rows.push({ kind: 'divider' });
    rows.push({ kind: 'etims', invoiceNumber: receipt.etims_invoice_number, qrUrl: receipt.etims_qr_code_url });
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

  // Retail: Code 128 of the order number, right above the configurable footer text.
  if (receipt.barcode_png) {
    rows.push({ kind: 'barcode', src: receipt.barcode_png, text: receipt.order_number });
  }

  rows.push({ kind: 'footer', text: receipt.receipt_footer || 'Thank you for your business!' });

  // Platform-owner (Codevertex) advertisement — always shown, from the API or a static fallback.
  rows.push({
    kind: 'provider',
    lead: receipt.provider_footer_lead || PROVIDER_FOOTER_FALLBACK.lead,
    contact: receipt.provider_footer_contact || PROVIDER_FOOTER_FALLBACK.contact,
  });

  return rows;
}
