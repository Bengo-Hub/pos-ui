/**
 * Use-case-aware payment + workflow actions for the GoDigital-style inline POS action bar.
 *
 * The order terminal renders these directly on the page (no method-picker modal): the bottom bar
 * shows the payment methods relevant to the outlet's use case, and clicking one runs a lightweight
 * inline capture (cash tendered / card approval ref) or hands off to the treasury gateway flow.
 *
 * `paymentActionsFor()` is the single source of truth for WHICH tenders appear, gated by:
 *   - the terminal profile (retail · hospitality · quick_service · services)
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
  | 'payhero'
  // Manual codes the cashier reads off the customer's phone. They settle at once and work offline.
  | 'mpesa_code' // pos-api mpesa_manual
  | 'mtn_momo_code' // pos-api mtn_momo_manual
  | 'airtel_money_code' // pos-api airtel_money_manual
  | 'other_manual'; // any other way to pay, named by the cashier

export type TenderTone = 'cash' | 'card' | 'mpesa' | 'wallet' | 'credit' | 'room' | 'cod' | 'split' | 'loyalty' | 'payhero' | 'mtn' | 'airtel' | 'other';

/** Manual tenders that take a transaction code. */
export type ManualCodeMethod = 'mpesa_manual' | 'mtn_momo_manual' | 'airtel_money_manual';

/** MTN MoMo and Airtel Money transaction IDs, checked after trimming and uppercasing.
 *  Same rule as pos-api. */
export const MANUAL_TXN_ID_RE = /^[A-Z0-9][A-Z0-9.-]{5,29}$/;
export const PAYMENT_LABEL_MIN = 2;
export const PAYMENT_LABEL_MAX = 40;
export const OTHER_REF_MAX = 40;

export function normalizeManualCode(value: string): string {
  return value.trim().toUpperCase();
}

/** True when the code may be sent for this method. M-Pesa codes only need to be present. */
export function isValidManualCode(method: ManualCodeMethod, value: string): boolean {
  const code = normalizeManualCode(value);
  if (!code) return false;
  if (method === 'mpesa_manual') return true;
  return MANUAL_TXN_ID_RE.test(code);
}

export function isValidPaymentLabel(value: string): boolean {
  // Count characters the way pos-api does (runes), so an emoji is one, not two.
  const n = [...value.trim()].length;
  return n >= PAYMENT_LABEL_MIN && n <= PAYMENT_LABEL_MAX;
}

/** Copy for each manual code tender's capture step. */
export const MANUAL_CODE_TENDERS: Record<ManualCodeMethod, { title: string; network: string; placeholder: string; maxLength: number }> = {
  mpesa_manual: { title: 'M-Pesa Code', network: 'M-Pesa', placeholder: 'e.g. QB234ABCDE', maxLength: 20 },
  mtn_momo_manual: { title: 'MTN MoMo Code', network: 'MTN', placeholder: 'e.g. 12345678901', maxLength: 30 },
  airtel_money_manual: { title: 'Airtel Money Code', network: 'Airtel', placeholder: 'e.g. CI251111.1530.A12345', maxLength: 30 },
};

/** "Customer pays MTN 077..." line for the capture step, from the outlet's payment settings. */
export function manualCodePayToLine(
  method: ManualCodeMethod,
  settings?: { mtn_momo_number?: string | null; airtel_money_number?: string | null } | null,
): string | null {
  const number = method === 'mtn_momo_manual' ? settings?.mtn_momo_number
    : method === 'airtel_money_manual' ? settings?.airtel_money_number
    : null;
  return number ? `Customer pays ${MANUAL_CODE_TENDERS[method].network} ${number}` : null;
}

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
const MPESA_CODE: TenderAction = { key: 'mpesa_code', label: 'M-Pesa Code', sublabel: 'Enter the M-Pesa code', tone: 'mpesa' };
const MTN_CODE: TenderAction = { key: 'mtn_momo_code', label: 'MTN MoMo Code', sublabel: 'Enter the MTN code', tone: 'mtn' };
const AIRTEL_CODE: TenderAction = { key: 'airtel_money_code', label: 'Airtel Money Code', sublabel: 'Enter the Airtel code', tone: 'airtel' };
const OTHER_MANUAL: TenderAction = { key: 'other_manual', label: 'Other', sublabel: 'Name how they paid', tone: 'other' };

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
 * MTN MoMo and Airtel Money codes are offered only where the outlet has that network's number in
 * its payment settings (owner decision 2026-11-12); M-Pesa Code always shows. Settings that have
 * not loaded yet hide them too, so a Kenya-only till never flashes networks it does not take.
 */
export function outletOffersNetwork(
  method: 'mtn_momo_manual' | 'airtel_money_manual',
  settings?: { mtn_momo_number?: string | null; airtel_money_number?: string | null } | null,
): boolean {
  const n = method === 'mtn_momo_manual' ? settings?.mtn_momo_number : settings?.airtel_money_number;
  return typeof n === 'string' && n.trim() !== '';
}

/** Drops the MTN/Airtel code tenders the outlet does not offer. */
export function withOutletNetworks<T extends { key: TenderKey }>(
  actions: T[],
  settings?: { mtn_momo_number?: string | null; airtel_money_number?: string | null } | null,
): T[] {
  return actions.filter((a) => {
    if (a.key === 'mtn_momo_code') return outletOffersNetwork('mtn_momo_manual', settings);
    if (a.key === 'airtel_money_code') return outletOffersNetwork('airtel_money_manual', settings);
    return true;
  });
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
  const ordered: TenderAction[] = [CASH, CARD_PDQ, MPESA_CODE, MTN_CODE, AIRTEL_CODE, OTHER_MANUAL, MPESA_STK, MPESA_C2B, payhero, CARD_ONLINE, WALLET];
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

/** The payment-intent request that charges a sale to a guest's room. pos-api writes the folio
 *  line with the payment in one transaction, idempotent per order, and completes the order, so
 *  the till treats it like any settled tender. It needs the network: a room charge is never
 *  queued offline. `attemptKey` identifies one Charge to Room screen; the idempotency key adds
 *  the room, so a retry of the same charge returns the first result while a bill split across two
 *  rooms (or two portions opened separately) posts each charge. */
export function roomChargeIntent(orderId: string, roomId: string, amount: number, tenderId?: string, attemptKey?: string) {
  return {
    orderId, tenderMethod: 'room_charge', amount, tenderId, roomId,
    idempotencyKey: attemptKey ? `${attemptKey}:${roomId}` : undefined,
  };
}

/** A fresh key for one Charge to Room screen (see roomChargeIntent). */
export function newRoomChargeAttemptKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `rc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    case 'mpesa_code': return 'mpesa_manual';
    case 'mtn_momo_code': return 'mtn_momo_manual';
    case 'airtel_money_code': return 'airtel_money_manual';
    case 'other_manual': return 'other_manual';
    default: return 'cash';
  }
}

/** Tenders that settle immediately at the point of sale (no gateway round-trip). */
export function isImmediateTender(key: TenderKey): boolean {
  return key === 'cash' || key === 'card_pdq' || key === 'on_account' || key === 'customer_credit'
    || key === 'mpesa_code' || key === 'mtn_momo_code' || key === 'airtel_money_code' || key === 'other_manual';
}

/**
 * The pay-page gateway a tender hands off to (TreasuryPaymentModal allowedMethods): the one
 * gateway the cashier picked, so the pay page opens it directly. PayHero opens its modal with
 * every rail it takes; the customer picks theirs there.
 */
export function allowedMethodsFor(key: TenderKey): string {
  return tenderMethodFor(key);
}
