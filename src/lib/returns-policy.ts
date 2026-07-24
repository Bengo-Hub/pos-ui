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
  /** Plain-language explanation for a hover/tap info-tip — no accounting jargon, written for a
   *  business owner who never studied bookkeeping. */
  hint: string;
}

export const REFUND_CHANNELS: RefundChannelOption[] = [
  { value: 'cash', label: 'Cash', hint: 'Hand the money back to the customer in cash.' },
  { value: 'mpesa', label: 'M-Pesa', hint: 'Send the money back to the customer via M-Pesa.' },
  { value: 'bank', label: 'Bank', hint: 'Send the money back to the customer’s bank account.' },
  { value: 'cheque', label: 'Cheque', hint: 'Give the money back by writing the customer a cheque.' },
  {
    value: 'store_credit',
    label: 'Store Credit',
    hint: 'Don’t give money back now — instead, keep this amount as credit the customer can spend on a future visit.',
  },
  {
    value: 'offset_invoice',
    label: 'Reduce customer credit',
    hint: 'Use this amount to lower how much the customer still owes you, instead of giving money back. Use this when the sale was on credit and not yet fully paid.',
  },
];

export const STORE_CREDIT_BLOCKED_REASONS = new Set(['defective', 'damaged', 'expired', 'wrong_item']);

/** Channels the server will accept for this (reason, on-account) combination. */
export function allowedRefundChannels(reasonCode?: string, onAccount?: boolean): RefundChannelOption[] {
  return REFUND_CHANNELS.filter((ch) => {
    // An on-account (unpaid credit) sale can ONLY be settled by offsetting the balance — never
    // store credit, which would stack a new credit on top of the still-open debt instead of
    // reducing it (see returns_policy.go validateRefundChannel; matches the server 1:1 so the
    // cashier never picks an option the backend will 422 on).
    if (onAccount && ch.value !== 'offset_invoice') return false;
    if (ch.value === 'store_credit' && reasonCode && STORE_CREDIT_BLOCKED_REASONS.has(reasonCode)) return false;
    return true;
  });
}

/** Human explanation of the constraint currently in force, or null when unrestricted. */
export function refundChannelAdvisory(reasonCode?: string, onAccount?: boolean): string | null {
  const fault = !!reasonCode && STORE_CREDIT_BLOCKED_REASONS.has(reasonCode);
  if (onAccount) {
    return 'This sale was on account (still owed) — the return reduces what the customer owes instead of paying out money or store credit.';
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
