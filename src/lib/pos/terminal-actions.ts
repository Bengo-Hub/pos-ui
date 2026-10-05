/**
 * Use-case-aware payment + workflow actions for the GoDigital-style inline POS action bar.
 *
 * The order terminal renders these directly on the page (no method-picker modal): the bottom bar
 * shows the payment methods relevant to the outlet's use case, and clicking one runs a lightweight
 * inline capture (cash tendered / card approval ref) or hands off to the treasury gateway flow.
 *
 * `paymentActionsFor()` is the single source of truth for WHICH tenders appear, gated by:
 *   - the terminal profile (retail · pharmacy · hospitality · quick_service · services)
 *   - the tenant's enabled gateways (from usePOSGateways → treasury)
 *   - hospitality (room charge only shows for hotel/restaurant/bar/cafe outlets)
 */

import type { TerminalProfile } from '@/lib/use-case-config';

/** Canonical tender keys understood by the inline bar + pos-api payment service. */
export type TenderKey =
  | 'cash'
  | 'card_pdq' // external card terminal / PDQ — settles immediately (treasury card_manual)
  | 'mpesa_stk' // M-Pesa STK Push (prompt sent to the customer's phone)
  | 'mpesa_c2b' // M-Pesa C2B — customer paid the till directly; match by amount + claim
  | 'wallet'
  | 'card_online' // Paystack-hosted card
  | 'cod' // cash on delivery (delivery orders) — order placed, settled on delivery
  | 'on_account' // credit sale → treasury AR
  | 'room' // charge to room folio (hospitality only)
  | 'split' // multiple/split payment
  | 'customer_credit' // settle from the customer's existing stored credit (negative AR balance_due)
  | 'loyalty_points' // pay-with-points (posts a completed payment on the tenant's Loyalty tender)
  // PayHero, its own gateway like Paystack: one tender opening the PayHero modal on the pay page,
  // where the customer picks M-Pesa, Airtel, card or another rail the outlet's country has.
  | 'payhero';

export type TenderTone = 'cash' | 'card' | 'mpesa' | 'wallet' | 'credit' | 'room' | 'cod' | 'split' | 'loyalty' | 'payhero';

export interface TenderAction {
  key: TenderKey;
  label: string;
  sublabel: string;
  tone: TenderTone;
  /** True when this tender needs network (gateway) — hidden/disabled when offline. */
  online?: boolean;
  /** When set, only show if usePOSGateways reports this gateway enabled. */
  requiresGateway?: keyof GatewayFlags;
  /** When set, show if usePOSGateways reports ANY of these enabled. */
  requiresAny?: (keyof GatewayFlags)[];
}

// Always-available, offline-capable tenders (cash drawer + external card machine + manual M-Pesa code).
const CASH: TenderAction = { key: 'cash', label: 'Cash', sublabel: 'Cash drawer', tone: 'cash' };
const CARD_PDQ: TenderAction = { key: 'card_pdq', label: 'Card (PDQ)', sublabel: 'Swipe / insert on terminal', tone: 'card' };
const SPLIT: TenderAction = { key: 'split', label: 'Multiple Pay', sublabel: 'Split the bill', tone: 'split' };
const ON_ACCOUNT: TenderAction = { key: 'on_account', label: 'Credit Sale', sublabel: 'On account (AR)', tone: 'credit', online: true };

/**
 * Store-credit tender — NOT part of `paymentActionsFor()` because its visibility is data-driven
 * (does THIS customer hold usable credit?) rather than profile/gateway-driven. The caller
 * (inline-payment-bar.tsx / payment-modal.tsx) appends it conditionally once it knows the
 * selected customer's available balance, using this builder for a consistent label/sublabel.
 */
export function customerCreditAction(availableAmount: number, currency = 'KES'): TenderAction {
  return {
    key: 'customer_credit',
    label: 'Apply Credit',
    sublabel: `${currency} ${Math.max(0, availableAmount).toLocaleString()} available`,
    tone: 'credit',
    online: true,
  };
}

/** Loyalty account fields the redeem-as-tender math needs (subset of useLoyalty's LoyaltyAccount
 *  + the tenant's active LoyaltyProgram, resolved by the caller). */
export interface LoyaltyRedeemInfo {
  accountId: string;
  pointsBalance: number;
  /** Currency value of 1 point. */
  redeemRate: number;
  minRedeemPoints: number;
}

/** Whole points required to cover `amount` KES at this program's redeem_rate. */
export function loyaltyPointsNeeded(amount: number, redeemRate: number): number {
  if (redeemRate <= 0) return 0;
  return Math.ceil(amount / redeemRate);
}

/** True when the account holds ANY redeemable balance (meets min_redeem_points) — used to decide
 *  whether to show the "Redeem Points" tender at all, independent of the amount being settled. */
export function hasRedeemableLoyalty(info?: LoyaltyRedeemInfo | null): boolean {
  if (!info?.accountId || info.pointsBalance <= 0 || info.redeemRate <= 0) return false;
  return info.minRedeemPoints <= 0 || info.pointsBalance >= info.minRedeemPoints;
}

/**
 * True when the account's points can fully cover `amount` WITHOUT exceeding the balance or
 * dropping under the program's minimum redemption — i.e. it is safe to settle `amount` in one
 * shot via redeem-to-order. Used to gate the settle button for a single tender/split line (never
 * silently redeems fewer points than a line needs, which would under-report that line as paid).
 */
export function canRedeemLoyaltyFor(amount: number, info?: LoyaltyRedeemInfo | null): boolean {
  if (!hasRedeemableLoyalty(info) || amount <= 0) return false;
  const needed = loyaltyPointsNeeded(amount, info!.redeemRate);
  return needed > 0 && needed <= info!.pointsBalance && needed >= (info!.minRedeemPoints || 0);
}

/** Points to send to POST .../redeem-to-order to cover `amount` (caller must have already
 *  confirmed `canRedeemLoyaltyFor(amount, info)`). */
export function loyaltyPointsToRedeem(amount: number, info: LoyaltyRedeemInfo): number {
  return Math.min(info.pointsBalance, Math.max(loyaltyPointsNeeded(amount, info.redeemRate), info.minRedeemPoints || 0));
}

export function loyaltyRedeemAction(info: LoyaltyRedeemInfo, currency = 'KES'): TenderAction {
  const availableKES = Math.floor(info.pointsBalance * info.redeemRate);
  return {
    key: 'loyalty_points',
    label: 'Redeem Points',
    sublabel: `${info.pointsBalance.toLocaleString()} pts · ${currency} ${availableKES.toLocaleString()} available`,
    tone: 'loyalty',
    online: true,
  };
}

// Gateway-gated, online tenders. Labels deliberately omit "M-Pesa" — the MpesaLogo icon rendered
// alongside each button already carries the brand, so repeating it in text next to a sibling pair
// of M-Pesa buttons (STK Push / C2B) would be redundant.
// STK Push and C2B are Daraja (the tenant's own M-Pesa paybill or till); PayHero's M-Pesa is
// inside the PayHero tender.
const MPESA_STK: TenderAction = { key: 'mpesa_stk', label: 'STK Push', sublabel: 'Prompt to phone', tone: 'mpesa', online: true, requiresGateway: 'mpesa' };
// C2B reads Daraja till confirmations.
const MPESA_C2B: TenderAction = { key: 'mpesa_c2b', label: 'C2B', sublabel: 'Customer paid the till', tone: 'mpesa', online: true, requiresGateway: 'mpesa_c2b' };
const CARD_ONLINE: TenderAction = { key: 'card_online', label: 'Paystack', sublabel: 'Paystack secure page', tone: 'card', online: true, requiresGateway: 'paystack' };
const WALLET: TenderAction = { key: 'wallet', label: 'Wallet', sublabel: 'Airtel Money & more', tone: 'wallet', online: true, requiresGateway: 'wallet' };
const COD: TenderAction = { key: 'cod', label: 'Cash on Delivery', sublabel: 'Collect on delivery', tone: 'cod', online: true, requiresGateway: 'cod' };
const ROOM: TenderAction = { key: 'room', label: 'Charge to Room', sublabel: 'Post to guest folio', tone: 'room', online: true };

const PAYHERO: TenderAction = { key: 'payhero', label: 'PayHero', sublabel: 'M-Pesa & more', tone: 'payhero', online: true, requiresGateway: 'payhero' };

// Short names of PayHero's rails for the tender's sublabel.
const PAYHERO_RAIL_NAMES: Record<string, string> = {
  mpesa: 'M-Pesa', payhero_offline: 'Paybill', airtel_money: 'Airtel', mtn_momo: 'MTN',
  payhero_momo: 'Mobile money', payhero_card: 'Card', payhero_bank: 'Bank',
};

/** "M-Pesa, Airtel & Card": what the PayHero tender takes, from the rails treasury reports. */
export function payheroSublabel(methods: string[] | undefined): string {
  const names = (methods ?? []).map((m) => PAYHERO_RAIL_NAMES[m]).filter(Boolean);
  if (names.length === 0) return PAYHERO.sublabel;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export interface GatewayFlags {
  /** Daraja M-Pesa (the tenant's own paybill or till). */
  mpesa?: boolean;
  /** Daraja backs M-Pesa, so a customer's direct till payment can be matched (C2B). */
  mpesa_c2b?: boolean;
  paystack?: boolean;
  wallet?: boolean;
  cod?: boolean;
  /** PayHero, with the rails it takes in the outlet's currency. */
  payhero?: boolean;
  payhero_methods?: string[];
}

/**
 * Ordered tender list for a profile. Cash + Card(PDQ) + Multiple Pay + M-Pesa + Credit are the retail
 * core; hospitality adds Room charge; delivery-capable outlets get COD. Gateway-gated tenders are
 * filtered out when the tenant hasn't enabled that gateway (and when offline).
 */
export function paymentActionsFor(
  profile: TerminalProfile,
  gateways: GatewayFlags | undefined,
  opts: { isHospitality?: boolean; isOnline?: boolean; allowCOD?: boolean } = {},
): TenderAction[] {
  const { isHospitality = false, isOnline = true, allowCOD = false } = opts;
  const g = gateways ?? {};

  // Credit Sale (charge to AR) is a back-office retail concept — it does NOT apply to
  // hospitality, quick_service or services, which settle at the point of sale.
  const allowCredit = profile === 'retail';

  const payhero = { ...PAYHERO, sublabel: payheroSublabel(g.payhero_methods) };
  const ordered: TenderAction[] = [CASH, CARD_PDQ, MPESA_STK, MPESA_C2B, payhero, CARD_ONLINE, WALLET];
  if (allowCredit) ordered.push(ON_ACCOUNT);
  ordered.push(SPLIT);

  // Hospitality outlets can post the bill to an occupied room's folio.
  if (isHospitality) ordered.splice(2, 0, ROOM);

  // COD only where delivery makes sense (retail/quick_service) and the gateway is enabled.
  if (allowCOD) ordered.push(COD);

  return ordered.filter((a) => {
    if (a.online && !isOnline) return a.key === 'card_pdq'; // PDQ works offline (manual ref); others need net
    if (a.requiresAny) return a.requiresAny.some((k) => k !== 'payhero_methods' && Boolean(g[k]));
    if (!a.requiresGateway) return true;
    return Boolean(g[a.requiresGateway]);
  });
}

/** Maps an inline TenderKey onto the tender_method string pos-api expects. */
export function tenderMethodFor(key: TenderKey): string {
  switch (key) {
    case 'cash': return 'cash';
    case 'card_pdq': return 'card_manual';
    case 'mpesa_stk': return 'mpesa';
    case 'mpesa_c2b': return 'mpesa'; // C2B reconciliation handled by the C2B claim flow, not an intent method
    case 'card_online': return 'card';
    case 'wallet': return 'wallet';
    case 'cod': return 'cod';
    case 'on_account': return 'on_account';
    case 'room': return 'room_charge';
    case 'customer_credit': return 'customer_credit';
    case 'payhero': return 'payhero'; // the rail is chosen in the PayHero modal
    case 'loyalty_points': return 'loyalty_points'; // never routed through createIntent — see useRedeemToOrder
    default: return 'cash';
  }
}

/** Tenders that settle immediately at the point of sale (no gateway round-trip). */
export function isImmediateTender(key: TenderKey): boolean {
  return key === 'cash' || key === 'card_pdq' || key === 'on_account' || key === 'customer_credit';
}

/**
 * The pay-page gateway a tender hands off to (TreasuryPaymentModal allowedMethods): the one
 * gateway the cashier picked, so the pay page opens it directly. PayHero opens its modal with
 * every rail it takes; the customer picks theirs there.
 */
export function allowedMethodsFor(key: TenderKey): string {
  return tenderMethodFor(key);
}
