/**
 * Refund-method policy — the client mirror of pos-api's returns_policy.go. The backend is
 * the enforcement boundary (422 on violations); this module drives the UX so the cashier
 * only sees channels the server will accept, with an advisory explaining WHY the rest are
 * unavailable.
 *
 * Rules:
 *  - defective / damaged / expired / wrong_item returns are the seller's failure — the
 *    customer must be made whole, so STORE CREDIT is not offered.
 *  - a return against an unpaid on-account (credit) sale must OFFSET the customer's
 *    balance — paying out cash would refund money the business never received.
 */

export interface RefundChannelOption {
  value: string;
  label: string;
}

export const REFUND_CHANNELS: RefundChannelOption[] = [
  { value: 'cash',           label: 'Cash' },
  { value: 'mpesa',          label: 'M-Pesa' },
  { value: 'bank',           label: 'Bank' },
  { value: 'cheque',         label: 'Cheque' },
  { value: 'store_credit',   label: 'Store Credit' },
  { value: 'offset_invoice', label: 'Offset Customer Account (AR)' },
];

export const STORE_CREDIT_BLOCKED_REASONS = new Set(['defective', 'damaged', 'expired', 'wrong_item']);

/** Channels the server will accept for this (reason, on-account) combination. */
export function allowedRefundChannels(reasonCode?: string, onAccount?: boolean): RefundChannelOption[] {
  return REFUND_CHANNELS.filter((ch) => {
    if (onAccount && ch.value !== 'offset_invoice' && ch.value !== 'store_credit') return false;
    if (ch.value === 'store_credit' && reasonCode && STORE_CREDIT_BLOCKED_REASONS.has(reasonCode)) return false;
    return true;
  });
}

/** Human explanation of the constraint currently in force, or null when unrestricted. */
export function refundChannelAdvisory(reasonCode?: string, onAccount?: boolean): string | null {
  const fault = !!reasonCode && STORE_CREDIT_BLOCKED_REASONS.has(reasonCode);
  if (onAccount && fault) {
    return 'This sale was on account (unpaid) and the goods are faulty — the return must offset the customer’s balance.';
  }
  if (onAccount) {
    return 'This sale was on account (unpaid) — the return offsets the customer’s balance instead of paying out money.';
  }
  if (fault) {
    return 'Faulty/wrong goods must be refunded to the customer — store credit is not offered for this reason.';
  }
  return null;
}

/** Default channel per the server's defaulting (returns_policy.go defaultRefundChannel). */
export function defaultRefundChannel(returnType: string, onAccount?: boolean): string {
  if (onAccount) return 'offset_invoice';
  if (returnType === 'store_credit') return 'store_credit';
  return 'cash';
}
