'use client';

/**
 * GoDigital-style inline POS action bar — renders the payment methods directly on the order page
 * (no separate "select a method" modal). Immediate tenders (Cash, Card/PDQ, Credit) capture inline;
 * online gateway tenders (M-Pesa STK Push, Paystack card, Wallet) hand off to the treasury pay flow;
 * M-Pesa C2B (customer paid the till directly) reconciles via the inline match panel; Room charge
 * posts to a guest folio.
 *
 * The bar owns the full settle flow but never creates the order itself — the page provides
 * `createOrderAsync()` (which runs all order validation + creation) so the bar can settle against a
 * real order id. For dine-in the page passes mode="send_to_kitchen" and the bar shows a single
 * Send-to-Kitchen button instead of tender buttons (payment happens later from the bill).
 */

import { AirtelMoneyLogo, CardMark, CashMark, MpesaLogo, MtnMomoLogo, PayHeroLogo, SplitPayMark, TreasuryPaymentModal } from '@bengo-hub/shared-ui-lib';
import { cn } from '@/lib/utils';
import { C2BPaymentMatcher } from '@/components/pos/c2b-payment-matcher';
import {
  Banknote, ChefHat, Coins, CreditCard, FileText, Gift, Loader2, NotebookPen,
  Building2, Truck, Wallet, SplitSquareHorizontal, X, CheckCircle2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useCreatePaymentIntent } from '@/hooks/usePOS';
import { formatCurrency } from '@/lib/utils';
import { useEffectiveOnline } from '@/lib/connectivity';
import { queueOfflinePayment as queueOfflinePaymentRecord } from '@/lib/pos/offline-payment';
import { useCashDrawer } from '@/hooks/useCashDrawer';
import { CreditSaleDetailsModal, type CreditSaleDetails } from '@/components/pos/credit-sale-details-modal';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { usePOSGateways } from '@/hooks/use-pos-gateways';
import { usePermissions } from '@/hooks/usePermissions';
import { useSubscription } from '@/hooks/use-subscription';
import { useHotelRooms } from '@/hooks/useHotel';
import { useTenantId } from '@/hooks/useTenantId';
import { hotelApi } from '@/lib/api/hotel';
import type { TerminalProfile } from '@/lib/use-case-config';
import {
  paymentActionsFor, tenderMethodFor, allowedMethodsFor, isImmediateTender, customerCreditAction,
  hasRedeemableLoyalty, canRedeemLoyaltyFor, loyaltyPointsToRedeem, loyaltyRedeemAction,
  isValidManualCode, isValidPaymentLabel, normalizeManualCode, manualCodePayToLine, MANUAL_CODE_TENDERS, withOutletNetworks,
  OTHER_REF_MAX, PAYMENT_LABEL_MAX,
  type TenderKey, type TenderTone, type LoyaltyRedeemInfo, type ManualCodeMethod,
} from '@/lib/pos/terminal-actions';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useRedeemToOrder } from '@/hooks/useLoyalty';

const NIL_TENDER = '00000000-0000-0000-0000-000000000000';

export interface CreatedOrder {
  orderId: string;
  orderNumber: string;
}

export interface InlinePaymentBarProps {
  total: number;
  tenantSlug: string;
  profile: TerminalProfile;
  isHospitality: boolean;
  allowCOD?: boolean;
  customerEmail?: string;
  tenderId?: string;
  /** Cart has no items / order can't be placed yet. */
  disabled?: boolean;
  /** dine-in shows Send-to-Kitchen; everything else shows tender buttons. */
  mode?: 'pay' | 'send_to_kitchen';
  /** Label of the single send_to_kitchen button (default "Place Order"; a services job uses "Create Job"). */
  sendLabel?: string;
  /** True when a real customer is selected (loyalty phone attached). Credit Sale requires one. */
  hasCustomer?: boolean;
  /** Attached customer's usable stored credit (KES, from useClientCredit's balance_due — already
   *  sign-flipped to a positive available amount by the caller). Shows "Apply Credit" when > 0;
   *  never fetched here so the bar stays a pure consumer of whatever the page already loaded. */
  customerCreditAvailable?: number;
  /** Attached customer's live loyalty account + program terms. Undefined/null hides the
   *  "Redeem Points" tender (no customer, no account, or no active program). */
  loyaltyAccount?: LoyaltyRedeemInfo | null;
  /** 'panel' = stacked tiles (narrow cart column); 'bar' = compact horizontal button row (GoDigital
   *  full-width bottom action bar). Defaults to 'panel'. */
  layout?: 'panel' | 'bar';
  /** Creates (or returns) the order to settle. Returns null if validation fails (toast already shown). */
  createOrderAsync: () => Promise<CreatedOrder | null>;
  /** Called after a tender settles (or after Send-to-Kitchen) so the page can show the receipt + reset. */
  onSettled: (order: CreatedOrder, opts?: { unpaid?: boolean }) => void;
  /** Page-owned secondary actions. */
  onDraft: () => void;
  onQuotation: () => void;
  onCancel: () => void;
  /** True while onDraft/onQuotation's underlying save is in flight — disables both buttons so a
   *  rapid double-click can't fire two saves before the first one's response clears the cart. */
  draftPending?: boolean;
  /** Opens the page's Multiple-Pay (split) modal for the given order. */
  onSplit: (order: CreatedOrder) => void;
}

const TONES: Record<TenderTone, { text: string; bg: string; ring: string }> = {
  cash:  { text: 'text-emerald-700', bg: 'bg-emerald-500/10', ring: 'hover:border-emerald-500/50' },
  card:  { text: 'text-blue-700',    bg: 'bg-blue-500/10',    ring: 'hover:border-blue-500/50' },
  mpesa: { text: 'text-green-700',   bg: 'bg-green-500/10',   ring: 'hover:border-green-500/50' },
  wallet:{ text: 'text-purple-700',  bg: 'bg-purple-500/10',  ring: 'hover:border-purple-500/50' },
  credit:{ text: 'text-orange-700',  bg: 'bg-orange-500/10',  ring: 'hover:border-orange-500/50' },
  room:  { text: 'text-indigo-700',  bg: 'bg-indigo-500/10',  ring: 'hover:border-indigo-500/50' },
  cod:   { text: 'text-amber-700',   bg: 'bg-amber-500/10',   ring: 'hover:border-amber-500/50' },
  split: { text: 'text-violet-700',  bg: 'bg-violet-500/10',  ring: 'hover:border-violet-500/50' },
  loyalty: { text: 'text-fuchsia-700', bg: 'bg-fuchsia-500/10', ring: 'hover:border-fuchsia-500/50' },
  payhero: { text: 'text-teal-700', bg: 'bg-teal-500/10', ring: 'hover:border-teal-500/50' },
  mtn:   { text: 'text-yellow-700',  bg: 'bg-yellow-500/10',  ring: 'hover:border-yellow-500/50' },
  airtel:{ text: 'text-red-700',     bg: 'bg-red-500/10',     ring: 'hover:border-red-500/50' },
  other: { text: 'text-slate-700',   bg: 'bg-slate-500/10',   ring: 'hover:border-slate-500/50' },
};

// Inline tender keys that capture a transaction code, with the pos-api method each one records.
const CODE_CAPTURE: Partial<Record<TenderKey, ManualCodeMethod>> = {
  mpesa_code: 'mpesa_manual',
  mtn_momo_code: 'mtn_momo_manual',
  airtel_money_code: 'airtel_money_manual',
};

// PayHero's official mark (the "PH" circles); like MpesaLogo it is wider than tall.
function PayHeroIcon({ className }: { className?: string }) {
  return <PayHeroLogo className={className} />;
}

// Brand marks wider than the square lucide icons need a wider slot.
const isWideLogo = (key: TenderKey) => key === 'mpesa_stk' || key === 'mpesa_c2b' || key === 'mpesa_code' || key === 'payhero';
// Disc marks (shared-ui-lib, PayHero's style) carry their own colour and sit a size up.
const isDiscMark = (key: TenderKey) => key === 'cash' || key === 'card_pdq' || key === 'split' || key === 'mtn_momo_code' || key === 'airtel_money_code';
// The mark already says the name, so the button shows the logo alone (aria-label carries it).
const isLogoOnly = (key: TenderKey) => key === 'payhero';

/** Icon box classes per kind: wide brand logo, disc mark or square lucide icon. */
function iconClass(key: TenderKey, size: 'bar' | 'panel'): string {
  if (isWideLogo(key)) return size === 'bar' ? (isLogoOnly(key) ? 'h-6 w-11 shrink-0' : 'h-4 w-7 shrink-0') : 'h-6 w-11';
  if (isDiscMark(key)) return size === 'bar' ? 'h-6 w-6 shrink-0' : 'h-8 w-8';
  return size === 'bar' ? 'h-4 w-4 shrink-0' : 'h-5 w-5';
}

function tenderIcon(key: TenderKey) {
  switch (key) {
    case 'cash': return CashMark;
    case 'card_pdq': return CardMark;
    case 'card_online': return CreditCard;
    case 'mpesa_stk': return MpesaLogo;
    case 'mpesa_c2b': return MpesaLogo;
    case 'wallet': return Wallet;
    case 'payhero': return PayHeroIcon;
    case 'on_account': return NotebookPen;
    case 'customer_credit': return Coins;
    case 'cod': return Truck;
    case 'room': return Building2;
    case 'split': return SplitPayMark;
    case 'loyalty_points': return Gift;
    case 'mpesa_code': return MpesaLogo;
    case 'mtn_momo_code': return MtnMomoLogo;
    case 'airtel_money_code': return AirtelMoneyLogo;
    case 'other_manual': return Banknote;
    default: return CreditCard;
  }
}

export function InlinePaymentBar(props: InlinePaymentBarProps) {
  const {
    total, tenantSlug, profile, isHospitality, allowCOD = false, customerEmail,
    tenderId = NIL_TENDER, disabled = false, mode = 'pay', layout = 'panel', hasCustomer = true,
    customerCreditAvailable = 0, loyaltyAccount = null,
    createOrderAsync, onSettled, onDraft, onQuotation, onCancel, onSplit, draftPending = false, sendLabel = 'Place Order',
  } = props;
  // The tenant the page names; offline payments queue under it.
  const pageTenantId = useTenantId() ?? '';

  // Credit Sale and Quotation are back-office/manager actions — same permission that approves sale
  // returns (pos.orders.manage). Ordinary cashiers must not ring a sale onto a customer's account or
  // raise a quotation. admin/superuser auto-pass in usePermissions.
  const { can } = usePermissions();
  const canPrivileged = can('pos.orders.manage');
  // C2B "Simulate" trigger (sandbox testing aid) shows for the demo tenant only.
  const { isDemo, hasFeature } = useSubscription();
  // Room charge only when the plan has the hotel module (else the rooms call is a 403 toast).
  const canChargeRoom = isHospitality && hasFeature('hotel_module');

  const roundedTotal = Math.max(0, Math.ceil(total));
  const isOnline = useEffectiveOnline();
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const { data: gateways } = usePOSGateways(currency);
  const { autoOpenOnSettle } = useCashDrawer();
  const createIntent = useCreatePaymentIntent();
  // Manual-PDQ policy: when the outlet requires an approval ref, the cashier must enter it before
  // settling a Card/PDQ payment (some acquirers/audits mandate the approval code on file).
  const requireCardRef = posSettings?.card_terminal_require_ref ?? false;

  // Active capture surface (inline popovers / handoffs).
  const [capture, setCapture] = useState<TenderKey | null>(null);
  const [busyKey, setBusyKey] = useState<TenderKey | null>(null);
  const [cashTendered, setCashTendered] = useState('');
  const [cardRef, setCardRef] = useState('');
  // Manual code tenders (M-Pesa / MTN / Airtel code) and the Other tender's label.
  const [manualCode, setManualCode] = useState('');
  const [otherLabel, setOtherLabel] = useState('');
  // The M-Pesa, MTN and Airtel code tenders share one "Mobile Money Code" pill that opens this
  // network picker, so the bar stays short on a phone and the cart keeps its room.
  const [codePickerOpen, setCodePickerOpen] = useState(false);
  // Capture panels open above the tender pills; on a phone the footer scrolls, so bring the
  // opened panel into view instead of letting it appear off-screen.
  const captureRef = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  // Online-gateway handoff (treasury pay modal) state.
  const [intentId, setIntentId] = useState('');
  const [initiateUrl, setInitiateUrl] = useState('');
  // The pay-page methods of the gateway handoff (allowedMethodsFor), e.g. "mpesa" or "mtn_momo,airtel_money".
  const [gatewayMethod, setGatewayMethod] = useState<string | null>(null);
  // Room charge.
  const [roomSearch, setRoomSearch] = useState('');

  // Credit Sale (on_account) is HIDDEN from cashiers by default (decision 2026-07-15, reversing
  // 2026-07-07): booking a sale onto a customer's account needs pos.payments.credit — granted
  // implicitly to managers/admins (pos.payments.* / pos.orders.manage / "*"), and grantable to a
  // cashier role explicitly via Roles & Permissions. Customer + treasury credit limit remain the
  // server-side guardrails; terms are captured via CreditSaleDetailsModal.
  const canCreditSale = can('pos.payments.credit') || canPrivileged;
  // Store credit (customer_credit) is gated purely on DATA, not a permission: does the attached
  // customer actually hold usable credit? paymentActionsFor() has no per-customer knowledge, so
  // it's appended here instead of growing that function's signature for one data-driven tender.
  // Placed just before Multiple Pay (same slot as Credit Sale) so a shortfall is one tap from
  // Multiple Pay to combine it with another tender for the remainder.
  // Requires a live server-side balance check (same as Credit Sale), so it's hidden offline —
  // paymentActionsFor()'s own online filter never sees this tender since it's appended after.
  const hasCustomerCredit = hasCustomer && customerCreditAvailable > 0 && isOnline;
  const canRedeemLoyalty = hasCustomer && isOnline && hasRedeemableLoyalty(loyaltyAccount);
  const redeemToOrder = useRedeemToOrder(loyaltyAccount?.accountId ?? '');
  const actions = useMemo(() => {
    const base = withOutletNetworks(
      paymentActionsFor(profile, gateways, { isHospitality: canChargeRoom, isOnline, allowCOD }),
      posSettings,
    ).filter((a) => a.key !== 'on_account' || canCreditSale);
    const extras = [];
    if (hasCustomerCredit) extras.push(customerCreditAction(customerCreditAvailable, currency));
    if (canRedeemLoyalty && loyaltyAccount) extras.push(loyaltyRedeemAction(loyaltyAccount, currency));
    if (extras.length === 0) return base;
    const splitIdx = base.findIndex((a) => a.key === 'split');
    if (splitIdx === -1) return [...base, ...extras];
    return [...base.slice(0, splitIdx), ...extras, ...base.slice(splitIdx)];
  }, [profile, gateways, canChargeRoom, isOnline, allowCOD, canCreditSale, hasCustomerCredit, customerCreditAvailable, canRedeemLoyalty, loyaltyAccount, currency, posSettings]);
  // Back-office profiles (retail/services) get Draft + Quotation; hospitality/QSR do not.
  // Quotation is additionally manager-gated (canPrivileged).
  const isBackOffice = profile === 'retail' || profile === 'services';
  const showQuotation = isBackOffice && canPrivileged;

  const reset = useCallback(() => {
    setCapture(null); setBusyKey(null); setCashTendered(''); setCardRef('');
    setManualCode(''); setOtherLabel(''); setCodePickerOpen(false);
    setOrder(null); setIntentId(''); setInitiateUrl(''); setGatewayMethod(null); setRoomSearch('');
  }, []);

  const finish = useCallback((ord: CreatedOrder, opts?: { unpaid?: boolean }) => {
    reset();
    onSettled(ord, opts);
  }, [onSettled, reset]);

  // Ensure the order exists, returning it (and caching for multi-step captures).
  const ensureOrder = useCallback(async (): Promise<CreatedOrder | null> => {
    if (order) return order;
    const ord = await createOrderAsync();
    if (ord) setOrder(ord);
    return ord;
  }, [order, createOrderAsync]);

  // ── Immediate-settle tenders (cash / card-PDQ / credit) ──────────────────────
  // amountTendered: the raw cash physically handed over (cash tender only) — e.g. a 2,000 note
  // against a 1,820 bill. Undefined for every other tender. This is what lets the printed
  // receipt show "Tendered"/"Change" (pos-api's cashPaymentData) instead of just the amount
  // applied — see CashCapture below, the only caller that ever passes it.
  // paymentLabel: how the customer paid, for the Other tender only.
  const settleImmediate = useCallback(async (key: TenderKey, externalRef?: string, creditDetails?: CreditSaleDetails, amountTendered?: number, paymentLabel?: string) => {
    setBusyKey(key);
    const ord = await ensureOrder();
    if (!ord) { setBusyKey(null); return; }
    const method = tenderMethodFor(key);

    // Offline: the order is already queued in IndexedDB (createOrderAsync). Queue the payment
    // too (shared queueOfflinePayment — see [[offline-payment.ts]]) so the sync worker records it
    // after the order syncs. Without this, offline cash would create an order but never capture
    // payment.
    const queueOffline = async () => {
      try {
        await queueOfflinePaymentRecord({ orderId: ord.orderId, tenderId, method, amount: roundedTotal, currency, tenantSlug, tenantId: pageTenantId, externalRef, amountTendered, paymentLabel });
        autoOpenOnSettle(method);
        toast.success('Saved offline — will sync when back online.');
        finish(ord);
      } catch (e) {
        setBusyKey(null);
        toast.error(await apiErrorMessage(e, 'Failed to save offline payment. Please try again.'));
      }
    };
    if (!isOnline) {
      await queueOffline();
      return;
    }

    createIntent.mutate(
      {
        orderId: ord.orderId, tenderMethod: method, amount: roundedTotal, tenderId, externalRef,
        paymentDueDate: creditDetails?.dueDate, creditNotes: creditDetails?.notes || undefined,
        applyStoreCredit: creditDetails?.applyStoreCredit,
        amountTendered,
        paymentLabel,
      },
      {
        onSuccess: () => { autoOpenOnSettle(method); finish(ord); },
        onError: async (e: any) => {
          // Write-behind on weak wifi: these tenders settle at the till, so a NETWORK-shaped
          // failure queues the capture (idempotent replay) instead of erroring the sale.
          const { isNetworkShapedError } = await import('@/lib/connectivity');
          if (isNetworkShapedError(e)) {
            await queueOffline();
            return;
          }
          setBusyKey(null);
          toast.error(await apiErrorMessage(e, 'Payment failed. Please try again.'));
        },
      },
    );
  }, [ensureOrder, createIntent, roundedTotal, tenderId, finish, autoOpenOnSettle, isOnline, tenantSlug, currency, pageTenantId]);

  // ── Online gateway tenders (M-Pesa STK / Paystack card / Wallet) ─────────────
  const startGateway = useCallback(async (key: TenderKey) => {
    setBusyKey(key);
    const ord = await ensureOrder();
    if (!ord) { setBusyKey(null); return; }
    const method = tenderMethodFor(key); // mpesa | card | wallet
    createIntent.mutate(
      { orderId: ord.orderId, tenderMethod: method, amount: roundedTotal, tenderId },
      {
        onSuccess: (data: any) => {
          setBusyKey(null);
          setIntentId(data.payment_intent_id);
          setInitiateUrl(data.initiate_url);
          setGatewayMethod(allowedMethodsFor(key));
          setCapture(key);
        },
        onError: async (e: any) => {
          setBusyKey(null);
          toast.error(await apiErrorMessage(e, 'Could not start payment. Please try again.'));
        },
      },
    );
  }, [ensureOrder, createIntent, roundedTotal, tenderId]);

  // ── Dispatch a tender button ─────────────────────────────────────────────────
  const onPick = useCallback(async (key: TenderKey) => {
    switch (key) {
      case 'cash':
        setCashTendered(String(roundedTotal));
        setCapture('cash');
        return;
      case 'card_pdq':
        setCardRef('');
        setCapture('card_pdq');
        return;
      case 'mpesa_code':
      case 'mtn_momo_code':
      case 'airtel_money_code':
      case 'other_manual':
        setManualCode('');
        setOtherLabel('');
        setCapture(key);
        return;
      case 'on_account':
        // A credit sale must be booked against a real customer account (never the walk-in ghost) —
        // the server rejects it too, but block early with a clear prompt to select a customer.
        if (!hasCustomer) {
          toast.error('Select a customer before recording a credit sale');
          return;
        }
        // Capture credit terms first (due date default +30d, notes) via the shared modal.
        setCapture('on_account');
        return;
      case 'customer_credit': {
        // Nothing to capture (no ref/terms) — settle immediately like Cash/On Account when the
        // credit covers the FULL total (this bar only ever settles one shot for the whole total,
        // it doesn't track a "remaining balance"). When credit falls short, hand off straight to
        // Multiple Pay so the cashier can combine a credit line with another tender for the rest —
        // reusing the existing split-tender flow rather than inventing a second partial-payment path.
        if (roundedTotal > 0 && customerCreditAvailable < roundedTotal) {
          setBusyKey('customer_credit');
          const ord = await ensureOrder();
          setBusyKey(null);
          if (ord) {
            toast.info(`Store credit covers ${formatCurrency(customerCreditAvailable, currency)} of ${formatCurrency(roundedTotal, currency)} — use Multiple Pay to add another tender for the rest.`);
            onSplit(ord);
          }
          return;
        }
        await settleImmediate('customer_credit');
        return;
      }
      case 'cod': {
        // COD: place the order; cash is collected on delivery (settled later from the order).
        setBusyKey('cod');
        const ord = await ensureOrder();
        setBusyKey(null);
        if (ord) { toast.success(`Order ${ord.orderNumber} placed — collect cash on delivery.`); finish(ord, { unpaid: true }); }
        return;
      }
      case 'split': {
        setBusyKey('split');
        const ord = await ensureOrder();
        setBusyKey(null);
        if (ord) onSplit(ord);
        return;
      }
      case 'room':
        setBusyKey('room');
        await ensureOrder();
        setBusyKey(null);
        setCapture('room');
        return;
      case 'mpesa_c2b':
        setBusyKey('mpesa_c2b');
        await ensureOrder();
        setBusyKey(null);
        setCapture('mpesa_c2b');
        return;
      case 'mpesa_stk':
      case 'card_online':
      case 'wallet':
      case 'payhero':
        await startGateway(key);
        return;
      case 'loyalty_points': {
        if (!loyaltyAccount) return;
        // Points fully cover the total → settle in one shot. Otherwise never partially redeem
        // here (that would under-report the sale as paid) — place the order and hand off to
        // Multiple Pay, same as the store-credit shortfall above, where "Redeem Points" is also
        // offered per split line for exactly the amount its points can cover.
        if (!canRedeemLoyaltyFor(roundedTotal, loyaltyAccount)) {
          setBusyKey('loyalty_points');
          const ord = await ensureOrder();
          setBusyKey(null);
          if (ord) {
            const availableKES = Math.floor(loyaltyAccount.pointsBalance * loyaltyAccount.redeemRate);
            toast.info(`Loyalty points cover up to ${formatCurrency(availableKES, currency)} of ${formatCurrency(roundedTotal, currency)} — use Multiple Pay to combine it with another tender.`);
            onSplit(ord);
          }
          return;
        }
        setBusyKey('loyalty_points');
        const ord = await ensureOrder();
        if (!ord) { setBusyKey(null); return; }
        redeemToOrder.mutate(
          { points: loyaltyPointsToRedeem(roundedTotal, loyaltyAccount), order_id: ord.orderId },
          {
            onSuccess: () => { setBusyKey(null); finish(ord); },
            onError: async (e: any) => {
              setBusyKey(null);
              toast.error(await apiErrorMessage(e, 'Could not redeem points. Please try again.'));
            },
          },
        );
        return;
      }
    }
  }, [roundedTotal, settleImmediate, ensureOrder, startGateway, finish, onSplit, customerCreditAvailable, loyaltyAccount, redeemToOrder, currency]);

  // ── Send to Kitchen (dine-in) ────────────────────────────────────────────────
  const sendToKitchen = useCallback(async () => {
    setBusyKey('cash');
    const ord = await createOrderAsync();
    setBusyKey(null);
    if (ord) finish(ord, { unpaid: true });
  }, [createOrderAsync, finish]);

  const fmt = (n: number) => formatCurrency(n, currency);
  const anyBusy = busyKey !== null || createIntent.isPending;
  // Draft/Quotation save separately from the tender flow (anyBusy), so they need their own
  // pending flag — otherwise a rapid double-click fires two independent draft-create requests
  // before the first one's response clears the cart (see handlePark's own re-entrancy guard).
  const draftBusy = anyBusy || draftPending;

  // Bar layout: when more than one code tender is offered they collapse into one pill.
  const codeActions = actions.filter((a) => CODE_CAPTURE[a.key]);
  const groupCodes = codeActions.length > 1;
  const barActions = groupCodes ? actions.filter((a) => !CODE_CAPTURE[a.key]) : actions;
  const codeGroupIndex = groupCodes ? actions.findIndex((a) => CODE_CAPTURE[a.key]) : -1;

  useEffect(() => {
    if (capture || codePickerOpen) captureRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [capture, codePickerOpen]);

  return (
    <div className="border-t border-border bg-card/95 backdrop-blur">
      {/* ── Inline capture surfaces ────────────────────────────────────────── */}
      <div ref={captureRef} />
      {codePickerOpen && !capture && (
        <MobileMoneyCodePicker
          options={codeActions.map((a) => a.key)}
          total={roundedTotal}
          currency={currency}
          onPick={(key) => { setCodePickerOpen(false); onPick(key); }}
          onCancel={() => setCodePickerOpen(false)}
        />
      )}
      {capture === 'cash' && (
        <CashCapture
          total={roundedTotal}
          currency={currency}
          value={cashTendered}
          onChange={setCashTendered}
          busy={anyBusy}
          onCancel={reset}
          onConfirm={() => settleImmediate('cash', undefined, undefined, parseFloat(cashTendered) || roundedTotal)}
        />
      )}
      {capture === 'card_pdq' && (
        <CardRefCapture
          total={roundedTotal}
          currency={currency}
          value={cardRef}
          onChange={setCardRef}
          requireRef={requireCardRef}
          busy={anyBusy}
          onCancel={reset}
          onConfirm={() => settleImmediate('card_pdq', cardRef.trim() || undefined)}
        />
      )}
      {capture && CODE_CAPTURE[capture] && (
        <ManualCodeCapture
          method={CODE_CAPTURE[capture]!}
          total={roundedTotal}
          currency={currency}
          value={manualCode}
          onChange={setManualCode}
          payTo={manualCodePayToLine(CODE_CAPTURE[capture]!, posSettings)}
          busy={anyBusy}
          onCancel={reset}
          onConfirm={() => settleImmediate(capture, normalizeManualCode(manualCode))}
        />
      )}
      {capture === 'other_manual' && (
        <OtherTenderCapture
          total={roundedTotal}
          currency={currency}
          label={otherLabel}
          onLabelChange={setOtherLabel}
          reference={manualCode}
          onReferenceChange={setManualCode}
          busy={anyBusy}
          onCancel={reset}
          onConfirm={() => settleImmediate('other_manual', manualCode.trim() || undefined, undefined, undefined, otherLabel.trim())}
        />
      )}
      {capture === 'mpesa_c2b' && order && (
        <C2BPaymentMatcher
          amount={roundedTotal}
          currency={currency}
          orderId={order.orderId}
          tenderId={tenderId}
          isOnline={isOnline}
          onCancel={reset}
          onClaimed={() => finish(order)}
          showSimulateButton={isDemo}
          compact
        />
      )}
      {capture === 'on_account' && (
        <CreditSaleDetailsModal
          open
          amountLabel={fmt(roundedTotal)}
          amount={roundedTotal}
          availableStoreCredit={customerCreditAvailable}
          loading={anyBusy}
          onCancel={reset}
          onConfirm={(details) => { setCapture(null); void settleImmediate('on_account', undefined, details); }}
        />
      )}
      {capture === 'room' && order && (
        <RoomCapture
          amount={roundedTotal}
          currency={currency}
          orderNumber={order.orderNumber}
          tenantSlug={tenantSlug}
          search={roomSearch}
          onSearch={setRoomSearch}
          onCancel={reset}
          onCharged={() => finish(order)}
        />
      )}

      {/* Treasury gateway handoff (M-Pesa STK / Paystack / PayHero / Wallet). */}
      {(capture === 'mpesa_stk' || capture === 'card_online' || capture === 'wallet' || capture === 'payhero') && order && intentId && (
        <TreasuryPaymentModal
          open
          onOpenChange={(o: boolean) => { if (!o) reset(); }}
          paymentIntentId={intentId}
          tenantSlug={tenantSlug}
          initiateUrl={initiateUrl}
          amount={roundedTotal}
          currency={currency}
          description={`Order ${order.orderNumber}`}
          customerEmail={customerEmail}
          allowedMethods={gatewayMethod ?? undefined}
          referenceId={order.orderId}
          referenceType="pos_order"
          onPaymentConfirmed={() => finish(order)}
          onPaymentFailed={(err: any) => { toast.error(typeof err === 'string' ? err : 'Payment failed.'); reset(); }}
        />
      )}

      {/* ── Bottom action bar ──────────────────────────────────────────────── */}
      {mode === 'send_to_kitchen' ? (
        <div className="p-3">
          <button
            type="button"
            disabled={disabled || anyBusy}
            onClick={sendToKitchen}
            className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            {anyBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChefHat className="h-5 w-5" />}
            {sendLabel}
          </button>
        </div>
      ) : layout === 'bar' ? (
        /* GoDigital compact horizontal action bar — tenders render as modern pill BADGES (soft toned
           bg + tone text, icon + label inline), Draft/Quotation as neutral badges, Cancel red. The
           grand total is NOT repeated here — it already shows big in the cart header (TerminalShell)
           — so this whole row is free for tender buttons instead of splitting space with a redundant
           number. */
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          {isBackOffice && <BadgeBtn icon={FileText} label="Draft" onClick={onDraft} disabled={disabled || draftBusy} />}
          {showQuotation && <BadgeBtn icon={FileText} label="Quotation" onClick={onQuotation} disabled={draftBusy} />}
          {(groupCodes
            ? [...barActions.slice(0, codeGroupIndex), null, ...barActions.slice(codeGroupIndex)]
            : barActions
          ).map((a) => {
            if (a === null) {
              const isBusy = codeActions.some((c) => c.key === busyKey);
              return (
                <button
                  key="mobile-money-code"
                  data-testid="pos-tender-mobile-money-code"
                  type="button"
                  disabled={disabled || anyBusy}
                  onClick={() => { setCapture(null); setCodePickerOpen((o) => !o); }}
                  title="Enter an M-Pesa, MTN MoMo or Airtel Money code"
                  aria-expanded={codePickerOpen}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full pl-2 pr-4 py-2 min-h-11 text-sm font-bold transition-all',
                    'hover:brightness-95 active:scale-95 disabled:opacity-40 disabled:pointer-events-none',
                    TONES.mpesa.bg, TONES.mpesa.text, codePickerOpen && 'ring-2 ring-green-500/50',
                  )}
                >
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MobileMoneyMarks keys={codeActions.map((c) => c.key)} />}
                  <span className="whitespace-nowrap">Mobile Money Code</span>
                </button>
              );
            }
            const Icon = tenderIcon(a.key);
            const tone = TONES[a.tone];
            const isBusy = busyKey === a.key;
            // MpesaLogo and the PayHero mark are wider than tall, not square icons — a square box
            // letterboxes them down to an illegible sliver, so they get a wider slot (iconClass);
            // the disc marks sit a size up. A logo that already says the name stands alone.
            const logoOnly = isLogoOnly(a.key);
            return (
              <button
                key={a.key}
                data-testid={`pos-tender-${a.key}`}
                type="button"
                disabled={disabled || anyBusy}
                onClick={() => onPick(a.key)}
                title={logoOnly ? `${a.label}: ${a.sublabel}` : a.sublabel}
                aria-label={logoOnly ? a.label : undefined}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full py-2 min-h-11 text-sm font-bold transition-all',
                  logoOnly ? 'px-3' : isDiscMark(a.key) ? 'pl-2 pr-4' : 'px-4',
                  'hover:brightness-95 active:scale-95 disabled:opacity-40 disabled:pointer-events-none',
                  tone.bg, tone.text,
                )}
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className={iconClass(a.key, 'bar')} />}
                {!logoOnly && <span className="whitespace-nowrap">{a.label}</span>}
              </button>
            );
          })}
          <BadgeBtn icon={X} label="Cancel" tone="danger" onClick={onCancel} disabled={anyBusy} />
        </div>
      ) : (
        <div className="flex flex-col gap-2 p-3">
            {/* Total */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Payable</span>
              <span className="text-2xl font-extrabold tabular-nums text-emerald-600">{fmt(roundedTotal)}</span>
            </div>
            {/* Payment methods — rendered directly on the page (GoDigital style). The cart panel is
                narrow, so a fixed 2-column grid with centered icon + full (wrapping) label keeps every
                tile legible — no truncated "C…"/"M…" labels or clipped icons. */}
            <div className="grid grid-cols-2 gap-2">
              {actions.map((a) => {
                const Icon = tenderIcon(a.key);
                const tone = TONES[a.tone];
                const isBusy = busyKey === a.key;
                // See the "bar" layout above — wide brand marks need a wider slot than the
                // square lucide icons the other tenders share; disc marks bring their own colour.
                const isMpesa = isWideLogo(a.key);
                const disc = isDiscMark(a.key);
                return (
                  <button
                    key={a.key}
                    data-testid={`pos-tender-${a.key}`}
                    type="button"
                    disabled={disabled || anyBusy}
                    onClick={() => onPick(a.key)}
                    title={a.sublabel}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl border-2 border-border transition-all active:scale-95 disabled:opacity-40 min-h-20',
                      tone.ring,
                    )}
                  >
                    <span className={cn('h-10 rounded-lg flex items-center justify-center shrink-0', isMpesa ? 'w-16' : 'w-10', !disc && tone.bg, tone.text)}>
                      {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className={iconClass(a.key, 'panel')} />}
                    </span>
                    <span className="text-xs font-bold text-center leading-tight">{isLogoOnly(a.key) ? a.sublabel : a.label}</span>
                  </button>
                );
              })}
            </div>
            {/* Secondary workflow actions. Draft/Quotation are retail/back-office concepts — hospitality
                & QSR hold orders on tables / send to kitchen, so only Cancel shows there. */}
            <div className={cn('grid gap-2 pt-1',
              // columns = Cancel (always) + Draft (back-office) + Quotation (manager-gated)
              [null, 'grid-cols-1', 'grid-cols-2', 'grid-cols-3'][1 + (isBackOffice ? 1 : 0) + (showQuotation ? 1 : 0)])}>
              {isBackOffice && <SecondaryBtn icon={FileText} label="Draft" onClick={onDraft} disabled={disabled || draftBusy} />}
              {showQuotation && <SecondaryBtn icon={FileText} label="Quotation" onClick={onQuotation} disabled={draftBusy} />}
              <SecondaryBtn icon={X} label="Cancel" tone="danger" onClick={onCancel} disabled={anyBusy} />
            </div>
          </div>
        )}
      </div>
  );
}

// Pill/badge-style action used by the compact `layout="bar"` action bar. Neutral by default
// (muted bg) so Draft/Quotation match the tender badges; `tone="danger"` renders Cancel in red.
function BadgeBtn({ icon: Icon, label, onClick, disabled, tone }: {
  icon: React.ElementType; label: string; onClick: () => void; disabled?: boolean; tone?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-4 py-2 min-h-11 text-sm font-bold transition-all',
        'hover:brightness-95 active:scale-95 disabled:opacity-40 disabled:pointer-events-none',
        tone === 'danger'
          ? 'bg-destructive/10 text-destructive'
          : 'bg-muted text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function SecondaryBtn({ icon: Icon, label, onClick, disabled, tone }: {
  icon: React.ElementType; label: string; onClick: () => void; disabled?: boolean; tone?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-40',
        tone === 'danger'
          ? 'border-destructive/40 text-destructive hover:bg-destructive/5'
          : 'border-border hover:bg-accent',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ── Inline cash capture ────────────────────────────────────────────────────────
function CashCapture({ total, currency, value, onChange, busy, onConfirm, onCancel }: {
  total: number; currency: string; value: string; onChange: (v: string) => void; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const change = (parseFloat(value) || 0) - total;
  const quick = [total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div className="p-3 border-b border-border bg-emerald-500/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Cash · {formatCurrency(total, currency)}</span>
        <button onClick={onCancel} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent"><X className="h-4 w-4" /></button>
      </div>
      <input
        type="number" inputMode="decimal" autoFocus value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-background border border-border rounded-xl py-2.5 px-3 text-xl font-bold tabular-nums focus:ring-2 focus:ring-emerald-500/40 focus:outline-none"
      />
      <div className="flex gap-2">
        {quick.map((q) => (
          <button key={q} type="button" onClick={() => onChange(String(q))}
            className="flex-1 py-1.5 rounded-lg border border-border text-sm font-semibold hover:border-emerald-500/50">
            {q.toLocaleString()}
          </button>
        ))}
      </div>
      {change >= 0 && (
        <div className="flex justify-between text-sm rounded-lg bg-emerald-500/10 px-3 py-2">
          <span className="text-muted-foreground font-medium">Change</span>
          <span className="font-bold text-emerald-600 tabular-nums">{formatCurrency(change, currency)}</span>
        </div>
      )}
      <button
        data-testid="pos-confirm-cash"
        type="button" disabled={(parseFloat(value) || 0) < total || busy} onClick={onConfirm}
        className="w-full min-h-11 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-emerald-700 transition-colors"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
        Confirm Cash
      </button>
    </div>
  );
}

// ── Inline card / PDQ approval-ref capture ──────────────────────────────────────
// Manual flow: the cashier runs the card on the standalone PDQ machine, waits for the terminal to
// APPROVE, then records the approval/reference code here. When the outlet requires a ref, Confirm is
// disabled until a code is entered (some acquirers/audits mandate it on file).
function CardRefCapture({ total, currency, value, requireRef, onChange, busy, onConfirm, onCancel }: {
  total: number; currency: string; value: string; requireRef: boolean; onChange: (v: string) => void; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const refMissing = requireRef && value.trim() === '';
  return (
    <div className="p-3 border-b border-border bg-blue-500/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Card / PDQ · {formatCurrency(total, currency)}</span>
        <button onClick={onCancel} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent"><X className="h-4 w-4" /></button>
      </div>
      <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-0.5">
        <li>Run the card on the PDQ terminal for <span className="font-semibold text-foreground">{formatCurrency(total, currency)}</span>.</li>
        <li>Wait for the terminal to show <span className="font-semibold text-emerald-600">APPROVED</span>.</li>
        <li>Enter the Auth Code from its receipt below{requireRef ? '' : ' (optional)'}, then Confirm.</li>
      </ol>
      <input
        type="text" autoFocus value={value}
        placeholder={requireRef ? 'Auth Code (from receipt) — required' : 'Auth Code (from receipt) — optional'}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onKeyDown={(e) => { if (e.key === 'Enter' && !refMissing && !busy) onConfirm(); }}
        className="w-full bg-background border border-border rounded-xl py-2.5 px-3 text-base font-semibold tracking-wide uppercase focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
      />
      {refMissing && <p className="text-[11px] text-amber-600">This outlet requires the PDQ auth code before confirming.</p>}
      <button
        type="button" disabled={busy || refMissing} onClick={onConfirm}
        className="w-full min-h-11 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-blue-700 transition-colors"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
        Confirm Card Payment
      </button>
    </div>
  );
}

// Small overlapping official marks for the networks the outlet offers, shown on the grouped pill.
function MobileMoneyMarks({ keys }: { keys: TenderKey[] }) {
  return (
    <span className="flex items-center -space-x-1.5 shrink-0">
      {keys.includes('mpesa_code') && (
        <span className="h-6 w-9 rounded-full bg-white ring-1 ring-border flex items-center justify-center">
          <MpesaLogo className="h-3.5 w-7" />
        </span>
      )}
      {keys.includes('mtn_momo_code') && <MtnMomoLogo className="h-6 w-6 rounded-full ring-1 ring-border" />}
      {keys.includes('airtel_money_code') && (
        <span className="h-6 w-6 rounded-full bg-white ring-1 ring-border flex items-center justify-center">
          <AirtelMoneyLogo className="h-4 w-4" />
        </span>
      )}
    </span>
  );
}

const NETWORK_TILES: Partial<Record<TenderKey, { name: string; hint: string; logo: React.ReactNode }>> = {
  mpesa_code: { name: 'M-Pesa', hint: 'Code from the M-Pesa SMS', logo: <MpesaLogo className="h-8 w-16" /> },
  mtn_momo_code: { name: 'MTN MoMo', hint: 'MTN transaction ID', logo: <MtnMomoLogo className="h-10 w-10 rounded-lg" /> },
  airtel_money_code: { name: 'Airtel Money', hint: 'Airtel transaction ID', logo: <AirtelMoneyLogo className="h-9 w-9" /> },
};

// Network picker behind the grouped "Mobile Money Code" pill: one large tile per network with
// its official logo; picking one opens that network's code capture.
function MobileMoneyCodePicker({ options, total, currency, onPick, onCancel }: {
  options: TenderKey[]; total: number; currency: string; onPick: (key: TenderKey) => void; onCancel: () => void;
}) {
  return (
    <div className="p-3 border-b border-border bg-green-500/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Mobile money code · {formatCurrency(total, currency)}</span>
        <button onClick={onCancel} aria-label="Close" className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent"><X className="h-4 w-4" /></button>
      </div>
      <div className={cn('grid gap-2', options.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {options.map((key) => {
          const tile = NETWORK_TILES[key];
          if (!tile) return null;
          return (
            <button
              key={key}
              type="button"
              data-testid={`pos-code-network-${key}`}
              onClick={() => onPick(key)}
              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-border bg-background px-2 py-3 min-h-24 hover:border-green-500/50 active:scale-95 transition-all"
            >
              <span className="h-10 flex items-center justify-center">{tile.logo}</span>
              <span className="text-xs font-bold leading-tight">{tile.name}</span>
              <span className="text-[10px] text-muted-foreground leading-tight text-center">{tile.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Inline capture for a manual code tender (M-Pesa, MTN MoMo or Airtel Money code). The cashier
// reads the code off the customer's SMS. MTN and Airtel codes must match the pos-api format.
function ManualCodeCapture({ method, total, currency, value, onChange, payTo, busy, onConfirm, onCancel }: {
  method: ManualCodeMethod; total: number; currency: string; value: string; onChange: (v: string) => void;
  payTo: string | null; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const copy = MANUAL_CODE_TENDERS[method];
  const valid = isValidManualCode(method, value);
  const showFormatHint = method !== 'mpesa_manual' && value.trim() !== '' && !valid;
  return (
    <div className="p-3 border-b border-border bg-green-500/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{copy.title} · {formatCurrency(total, currency)}</span>
        <button onClick={onCancel} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent"><X className="h-4 w-4" /></button>
      </div>
      {payTo && <p className="text-xs font-semibold text-foreground">{payTo}</p>}
      <input
        type="text" autoFocus value={value} placeholder={copy.placeholder} maxLength={copy.maxLength}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onKeyDown={(e) => { if (e.key === 'Enter' && valid && !busy) onConfirm(); }}
        className="w-full bg-background border border-border rounded-xl py-2.5 px-3 text-base font-semibold tracking-widest uppercase focus:ring-2 focus:ring-green-500/40 focus:outline-none"
      />
      {showFormatHint && <p className="text-[11px] text-amber-600">Use 6 to 30 letters or digits. Dots and dashes are fine.</p>}
      <button
        type="button" disabled={busy || !valid} onClick={onConfirm}
        className="w-full min-h-11 rounded-xl bg-green-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-green-700 transition-colors"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
        Confirm {copy.network}
      </button>
    </div>
  );
}

// Inline capture for the Other tender: a required label (how they paid) and an optional reference.
function OtherTenderCapture({ total, currency, label, onLabelChange, reference, onReferenceChange, busy, onConfirm, onCancel }: {
  total: number; currency: string; label: string; onLabelChange: (v: string) => void;
  reference: string; onReferenceChange: (v: string) => void; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const valid = isValidPaymentLabel(label);
  return (
    <div className="p-3 border-b border-border bg-slate-500/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Other · {formatCurrency(total, currency)}</span>
        <button onClick={onCancel} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent"><X className="h-4 w-4" /></button>
      </div>
      <input
        type="text" autoFocus value={label} placeholder="How they paid, e.g. Bank deposit" maxLength={PAYMENT_LABEL_MAX}
        onChange={(e) => onLabelChange(e.target.value)}
        className="w-full bg-background border border-border rounded-xl py-2.5 px-3 text-base font-semibold focus:ring-2 focus:ring-slate-500/40 focus:outline-none"
      />
      <input
        type="text" value={reference} placeholder="Reference (optional)" maxLength={OTHER_REF_MAX}
        onChange={(e) => onReferenceChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && valid && !busy) onConfirm(); }}
        className="w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-slate-500/40 focus:outline-none"
      />
      <button
        type="button" disabled={busy || !valid} onClick={onConfirm}
        className="w-full min-h-11 rounded-xl bg-slate-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-slate-800 transition-colors"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
        Confirm Payment
      </button>
    </div>
  );
}

// ── Inline room-charge picker (hospitality) ─────────────────────────────────────
function RoomCapture({ amount, currency, orderNumber, tenantSlug, search, onSearch, onCancel, onCharged }: {
  amount: number; currency: string; orderNumber: string; tenantSlug: string; search: string; onSearch: (v: string) => void; onCancel: () => void; onCharged: () => void;
}) {
  const { data: rooms = [], isLoading } = useHotelRooms('occupied');
  const pageTenantId = useTenantId() ?? '';
  const post = useMutation({
    mutationFn: (roomId: string) =>
      hotelApi.postFolioCharge(pageTenantId, roomId, { description: `Bill ${orderNumber}`, amount, charge_type: 'restaurant' }),
    onSuccess: onCharged,
    onError: async (e: any) => toast.error(await apiErrorMessage(e, 'Failed to post charge to room.')),
  });
  const filtered = rooms.filter((r: any) =>
    !search || r.room_number?.toLowerCase().includes(search.toLowerCase()) ||
    (r.edges?.guests?.[0]?.guest_name ?? '').toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="p-3 border-b border-border bg-indigo-500/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Charge to Room · {formatCurrency(amount, currency)}</span>
        <button onClick={onCancel} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent"><X className="h-4 w-4" /></button>
      </div>
      <input
        type="text" autoFocus value={search} placeholder="Search room or guest…"
        onChange={(e) => onSearch(e.target.value)}
        className="w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500/40 focus:outline-none"
      />
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-indigo-600" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-3 text-xs text-muted-foreground">No occupied rooms.</p>
      ) : (
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {filtered.map((room: any) => (
            <button
              key={room.id} type="button" disabled={post.isPending}
              onClick={() => post.mutate(room.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border hover:border-indigo-500/50 text-left disabled:opacity-50"
            >
              <Building2 className="h-4 w-4 text-indigo-600 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Room {room.room_number}</span>
                <span className="block text-[10px] text-muted-foreground truncate">{room.edges?.guests?.[0]?.guest_name ?? room.room_type}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
