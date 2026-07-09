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
export interface ReceiptFooterRow { kind: 'footer'; text: string }

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
  | ReceiptFooterRow;

/** Builds the ordered receipt body: items → totals → payment → eTIMS → HOW TO PAY → served-by →
 *  footer. Excludes the top branding block (logo/tenant/outlet name/address), which callers render
 *  directly from plain string props — those don't need derivation and carry no drift risk. */
export function buildReceiptRows(receipt: ReceiptData): ReceiptRow[] {
  const rows: ReceiptRow[] = [];

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
  if ((receipt.charges_total ?? 0) > 0) {
    rows.push({ kind: 'money', label: 'Charges', amount: receipt.charges_total ?? 0 });
  }
  if ((receipt.round_off ?? 0) > 0) {
    rows.push({ kind: 'money', label: 'Round Off', amount: receipt.round_off ?? 0 });
  }
  rows.push({ kind: 'total', label: 'TOTAL', amount: receipt.total_amount });
  rows.push({ kind: 'payment', label: (receipt.payment_method ?? 'cash').replace(/_/g, ' '), amount: receipt.amount_tendered });
  if (receipt.change_due > 0) {
    rows.push({ kind: 'change', amount: receipt.change_due });
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

  rows.push({ kind: 'footer', text: receipt.receipt_footer || 'Thank you for your business!' });

  return rows;
}
