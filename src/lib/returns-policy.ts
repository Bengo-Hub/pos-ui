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
 *  - a sale paid in full has no balance to offset, so "Reduce customer credit" is not offered.
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
  // Offered only when the sale was paid that way (see ORIGINAL_ONLY_CHANNELS).
  { value: 'mpesa_manual', label: 'M-Pesa (Code)', hint: 'Send the money back by M-Pesa from the till or paybill the customer paid into.' },
  {
    value: 'room_folio',
    label: 'Room folio',
    hint: 'Take the amount off the guest’s room bill. While the stay is open the server always credits the folio; after checkout it refunds by the method chosen here.',
  },
  { value: 'mtn_momo_manual', label: 'MTN MoMo', hint: 'Send the money back to the customer’s MTN MoMo number.' },
  { value: 'airtel_money_manual', label: 'Airtel Money', hint: 'Send the money back to the customer’s Airtel Money number.' },
  { value: 'card_manual', label: 'Card', hint: 'Refund the money to the card the customer paid with, on the card machine.' },
  { value: 'other_manual', label: 'Other', hint: 'Give the money back the same other way the customer paid (for example a voucher).' },
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

/**
 * The refund channel that sends money back the way it came in (mirrors pos-api
 * payments.RefundChannelForMethod). Treasury first uses the tenant's account that defaults to the
 * channel's method, else books M-Pesa, MTN and Airtel refunds against the mobile money float, bank
 * and cheque against the bank, and cash, Other and card against cash. A room-charged sale is
 * credited to the open stay's folio.
 */
export function refundChannelForMethod(method?: string | null): string {
  const m = (method ?? '').trim().toLowerCase();
  switch (m) {
    case 'mpesa_manual': case 'manual':
      return 'mpesa_manual';
    case 'mpesa': case 'mpesa_stk': case 'mpesa_c2b':
      return 'mpesa';
    case 'room_charge':
      return 'room_folio';
    case 'mtn_momo_manual': case 'airtel_money_manual': case 'other_manual':
      return m;
    case 'card_manual': case 'pdq': case 'card_terminal': case 'card':
      return 'card_manual';
    case 'bank_transfer': case 'bank':
      return 'bank';
    case 'cheque':
      return 'cheque';
    default:
      return 'cash';
  }
}

const NON_MONEY_TENDERS = new Set(['on_account', 'customer_credit', 'exchange_credit', 'complimentary', 'loyalty_points', 'loyalty']);
// room_charge is not skipped: a room-charged sale refunds to the room folio (pos-api RefundChannelRoomFolio).

export interface PaymentForRefund {
  status?: string;
  amount?: number;
  tender_type?: string;
  payment_data?: { method?: string } | null;
}

/**
 * The sale's original refund channel: the completed money tender that carried the most (mirrors
 * pos-api payments.OriginalRefundChannel). null when the sale has no completed money payment.
 */
export function originalRefundChannel(payments?: PaymentForRefund[] | null): string | null {
  const totals = new Map<string, number>();
  for (const p of payments ?? []) {
    if (p.status !== 'completed') continue;
    const method = ((p.payment_data?.method || p.tender_type) ?? '').trim().toLowerCase();
    if (!method || NON_MONEY_TENDERS.has(method)) continue;
    const ch = refundChannelForMethod(method);
    totals.set(ch, (totals.get(ch) ?? 0) + (Number(p.amount) || 0));
  }
  let best: string | null = null;
  let bestAmt = 0;
  for (const [ch, amt] of totals) {
    if (amt > bestAmt + 0.005) { best = ch; bestAmt = amt; }
  }
  return best;
}

export interface RefundChannelContext {
  /** The outlet's payment settings: MTN/Airtel refunds show only where the outlet has that number. */
  settings?: { mtn_momo_number?: string | null; airtel_money_number?: string | null } | null;
  /** The sale's original channel, always offered so a refund can go back the way it was paid. */
  original?: string | null;
}

/**
 * Shown on the return screens for a room-charged sale: while the stay is open the server credits
 * the refund to the room bill whatever method is picked (up to what the bill still owes; the rest
 * goes by the picked method).
 */
export const ROOM_FOLIO_HINT = 'Credited to the guest’s room bill while the stay is open. Any amount the bill no longer owes is refunded by the method picked here.';

/** Channels that only make sense when the sale was paid that way. */
const ORIGINAL_ONLY_CHANNELS = new Set(['mpesa_manual', 'room_folio']);

/**
 * The refund_channel to send: the cashier's pick when there is one, else the sale's original
 * method once it is known, else nothing so the server applies its own default.
 */
export function refundChannelToSend(picked: string, original?: string | null): string | undefined {
  return picked || original || undefined;
}

function networkOffered(value: string, ctx?: RefundChannelContext): boolean {
  if (ORIGINAL_ONLY_CHANNELS.has(value)) return ctx?.original === value;
  if (!ctx) return true;
  if (value !== 'mtn_momo_manual' && value !== 'airtel_money_manual') return true;
  if (ctx.original === value) return true;
  const n = value === 'mtn_momo_manual' ? ctx.settings?.mtn_momo_number : ctx.settings?.airtel_money_number;
  return typeof n === 'string' && n.trim() !== '';
}

/** Channels the server will accept for this (reason, on-account) combination. */
export function allowedRefundChannels(
  reasonCode?: string,
  onAccount?: boolean,
  restrictOnAccount = true,
  ctx?: RefundChannelContext,
): RefundChannelOption[] {
  return REFUND_CHANNELS.filter((ch) => {
    if (!networkOffered(ch.value, ctx)) return false;
    // An on-account (unpaid credit) sale can ONLY be settled by offsetting the balance — never
    // store credit, which would stack a new credit on top of the still-open debt instead of
    // reducing it (see returns_policy.go validateRefundChannel; matches the server 1:1 so the
    // cashier never picks an option the backend will 422 on).
    if (onAccount && restrictOnAccount && ch.value !== 'offset_invoice') return false;
    // A sale paid in full left nothing owing, so there is no balance to reduce (server refuses it).
    if (!onAccount && ch.value === 'offset_invoice') return false;
    if (ch.value === 'store_credit' && reasonCode && STORE_CREDIT_BLOCKED_REASONS.has(reasonCode)) return false;
    return true;
  });
}

/** Human explanation of the constraint currently in force, or null when unrestricted. */
export function refundChannelAdvisory(reasonCode?: string, onAccount?: boolean, restrictOnAccount = true): string | null {
  const fault = !!reasonCode && STORE_CREDIT_BLOCKED_REASONS.has(reasonCode);
  if (onAccount && restrictOnAccount) {
    return 'This sale was on account (still owed) — the return reduces what the customer owes instead of paying out money or store credit.';
  }
  if (onAccount) {
    return "This sale was on account (still owed) — your tenant settings allow any refund method here at your discretion; offsetting the customer's balance is still recommended.";
  }
  if (fault) {
    return 'Faulty/wrong goods must be refunded to the customer — store credit is not offered for this reason.';
  }
  return null;
}

/**
 * Default channel per the server's defaulting: offset for an on-account sale, store credit for a
 * store-credit return, otherwise the sale's original method when known (cash when not).
 */
export function defaultRefundChannel(returnType: string, onAccount?: boolean, original?: string | null): string {
  if (onAccount) return 'offset_invoice';
  if (returnType === 'store_credit') return 'store_credit';
  return original || 'cash';
}

// Restock policy (mirrors pos-api returns/restock_policy.go): goods returned for these reasons
// cannot be resold, so by default they are written off instead of going back into stock. The
// outlet can change the list in Settings; a manager can override per return when completing it.
export const RETURN_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: 'damaged',      label: 'Damaged item' },
  { value: 'defective',    label: 'Defective item' },
  { value: 'expired',      label: 'Expired product' },
  { value: 'wrong_item',   label: 'Wrong item' },
  { value: 'changed_mind', label: 'Changed mind' },
  { value: 'other',        label: 'Other' },
];
export const DEFAULT_NO_RESTOCK_REASONS = ['damaged', 'defective', 'expired'];

/** restockByPolicy: no reason code (e.g. an Edit-Sale correction) always restocks. */
export function restockByPolicy(reasonCode?: string | null, noRestockReasons?: string[] | null): boolean {
  if (!reasonCode) return true;
  return !(noRestockReasons ?? DEFAULT_NO_RESTOCK_REASONS).includes(reasonCode);
}
