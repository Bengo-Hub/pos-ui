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

import { TreasuryPaymentModal } from '@bengo-hub/shared-ui-lib';
import { cn } from '@/lib/utils';
import { MpesaLogo } from '@/components/pos/mpesa-logo';
import { C2BPaymentMatcher } from '@/components/pos/c2b-payment-matcher';
import {
  Banknote, ChefHat, Coins, CreditCard, FileText, Gift, Hash, Loader2, NotebookPen,
  Building2, Truck, Wallet, SplitSquareHorizontal, X, CheckCircle2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
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
import { hotelApi } from '@/lib/api/hotel';
import type { TerminalProfile } from '@/lib/use-case-config';
import {
  paymentActionsFor, tenderMethodFor, isImmediateTender, customerCreditAction,
  hasRedeemableLoyalty, canRedeemLoyaltyFor, loyaltyPointsToRedeem, loyaltyRedeemAction,
  type TenderKey, type TenderTone, type LoyaltyRedeemInfo,
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
};

function tenderIcon(key: TenderKey) {
  switch (key) {
    case 'cash': return Banknote;
    case 'card_pdq': return CreditCard;
    case 'card_online': return CreditCard;
    case 'mpesa_stk': return MpesaLogo;
    case 'mpesa_c2b': return MpesaLogo;
    case 'wallet': return Wallet;
    case 'on_account': return NotebookPen;
    case 'customer_credit': return Coins;
    case 'cod': return Truck;
    case 'room': return Building2;
    case 'split': return SplitSquareHorizontal;
    case 'loyalty_points': return Gift;
    default: return CreditCard;
  }
}

export function InlinePaymentBar(props: InlinePaymentBarProps) {
  const {
    total, tenantSlug, profile, isHospitality, allowCOD = false, customerEmail,
    tenderId = NIL_TENDER, disabled = false, mode = 'pay', layout = 'panel', hasCustomer = true,
    customerCreditAvailable = 0, loyaltyAccount = null,
    createOrderAsync, onSettled, onDraft, onQuotation, onCancel, onSplit, draftPending = false,
  } = props;

  // Credit Sale and Quotation are back-office/manager actions — same permission that approves sale
  // returns (pos.orders.manage). Ordinary cashiers must not ring a sale onto a customer's account or
  // raise a quotation. admin/superuser auto-pass in usePermissions.
  const { can } = usePermissions();
  const canPrivileged = can('pos.orders.manage');
  // C2B "Simulate" trigger (sandbox testing aid) shows for the demo tenant only.
  const { isDemo } = useSubscription();

  const roundedTotal = Math.max(0, Math.ceil(total));
  const isOnline = useEffectiveOnline();
  const { data: gateways } = usePOSGateways();
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
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
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  // Online-gateway handoff (treasury pay modal) state.
  const [intentId, setIntentId] = useState('');
  const [initiateUrl, setInitiateUrl] = useState('');
  const [gatewayMethod, setGatewayMethod] = useState<'mpesa' | 'card' | 'wallet' | null>(null);
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
    const base = paymentActionsFor(profile, gateways, { isHospitality, isOnline, allowCOD })
      .filter((a) => a.key !== 'on_account' || canCreditSale);
    const extras = [];
    if (hasCustomerCredit) extras.push(customerCreditAction(customerCreditAvailable, currency));
    if (canRedeemLoyalty && loyaltyAccount) extras.push(loyaltyRedeemAction(loyaltyAccount, currency));
    if (extras.length === 0) return base;
    const splitIdx = base.findIndex((a) => a.key === 'split');
    if (splitIdx === -1) return [...base, ...extras];
    return [...base.slice(0, splitIdx), ...extras, ...base.slice(splitIdx)];
  }, [profile, gateways, isHospitality, isOnline, allowCOD, canCreditSale, hasCustomerCredit, customerCreditAvailable, canRedeemLoyalty, loyaltyAccount, currency]);
  // Back-office profiles (retail/pharmacy/services) get Draft + Quotation; hospitality/QSR do not.
  // Quotation is additionally manager-gated (canPrivileged).
  const isBackOffice = profile === 'retail' || profile === 'pharmacy' || profile === 'services';
  const showQuotation = isBackOffice && canPrivileged;

  const reset = useCallback(() => {
    setCapture(null); setBusyKey(null); setCashTendered(''); setCardRef('');
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
  const settleImmediate = useCallback(async (key: TenderKey, externalRef?: string, creditDetails?: CreditSaleDetails) => {
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
        await queueOfflinePaymentRecord({ orderId: ord.orderId, tenderId, method, amount: roundedTotal, currency, tenantSlug, externalRef });
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
  }, [ensureOrder, createIntent, roundedTotal, tenderId, finish, autoOpenOnSettle, isOnline, tenantSlug, currency]);

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
          setGatewayMethod(method as 'mpesa' | 'card' | 'wallet');
          setCapture(key);
        },
        onError: async (e: any) => {
          setBusyKey(null);
          toast.error(await apiErrorMessage(e, 'Could not start payment. Please try again.'));
        },
      },
    );
  }, [ensureOrder, createIntent, roundedTotal, tenderId]);

  // C2B timeout fallback: cashier sighted the M-Pesa SMS code but the automatic inbox match never
  // landed — settle the same way the standalone "M-Pesa Code" tender does (mpesa_manual).
  const [c2bManualPending, setC2bManualPending] = useState(false);
  const handleC2BManualCode = useCallback((code: string) => {
    if (!order) return;
    setC2bManualPending(true);
    createIntent.mutate(
      { orderId: order.orderId, tenderMethod: 'mpesa_manual', amount: roundedTotal, tenderId, externalRef: code },
      {
        onSuccess: () => { setC2bManualPending(false); finish(order); },
        onError: async (e: any) => {
          setC2bManualPending(false);
          toast.error(await apiErrorMessage(e, 'Could not verify M-Pesa code. Please check and try again.'));
        },
      },
    );
  }, [order, createIntent, roundedTotal, tenderId, finish]);

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

  return (
    <div className="border-t border-border bg-card/95 backdrop-blur">
      {/* ── Inline capture surfaces ────────────────────────────────────────── */}
      {capture === 'cash' && (
        <CashCapture
          total={roundedTotal}
          currency={currency}
          value={cashTendered}
          onChange={setCashTendered}
          busy={anyBusy}
          onCancel={reset}
          onConfirm={() => settleImmediate('cash')}
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
      {capture === 'mpesa_c2b' && order && (
        <C2BPaymentMatcher
          amount={roundedTotal}
          currency={currency}
          orderId={order.orderId}
          tenderId={tenderId}
          isOnline={isOnline}
          onCancel={reset}
          onClaimed={() => finish(order)}
          onManualCodeConfirm={handleC2BManualCode}
          manualConfirming={c2bManualPending}
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

      {/* Treasury gateway handoff (M-Pesa STK / Paystack card / Wallet). */}
      {(capture === 'mpesa_stk' || capture === 'card_online' || capture === 'wallet') && order && intentId && (
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
            Place Order
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
          {actions.map((a) => {
            const Icon = tenderIcon(a.key);
            const tone = TONES[a.tone];
            const isBusy = busyKey === a.key;
            // MpesaLogo is a wide wordmark (~1.88:1), not a square icon — a square box
            // letterboxes it down to an illegible sliver, so it needs a wider slot than the
            // other (genuinely square) lucide tender icons share here.
            const isMpesa = a.key === 'mpesa_stk' || a.key === 'mpesa_c2b';
            return (
              <button
                key={a.key}
                data-testid={`pos-tender-${a.key}`}
                type="button"
                disabled={disabled || anyBusy}
                onClick={() => onPick(a.key)}
                title={a.sublabel}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-4 py-2 min-h-11 text-sm font-bold transition-all',
                  'hover:brightness-95 active:scale-95 disabled:opacity-40 disabled:pointer-events-none',
                  tone.bg, tone.text,
                )}
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className={isMpesa ? 'h-4 w-7 shrink-0' : 'h-4 w-4 shrink-0'} />}
                <span className="whitespace-nowrap">{a.label}</span>
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
                // See the "bar" layout above — MpesaLogo is a wide wordmark, needs a wider slot
                // than the square lucide icons the other tenders share.
                const isMpesa = a.key === 'mpesa_stk' || a.key === 'mpesa_c2b';
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
                    <span className={cn('h-10 rounded-lg flex items-center justify-center shrink-0', isMpesa ? 'w-16' : 'w-10', tone.bg, tone.text)}>
                      {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className={isMpesa ? 'h-5 w-9' : 'h-5 w-5'} />}
                    </span>
                    <span className="text-xs font-bold text-center leading-tight">{a.label}</span>
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

// ── Inline room-charge picker (hospitality) ─────────────────────────────────────
function RoomCapture({ amount, currency, orderNumber, tenantSlug, search, onSearch, onCancel, onCharged }: {
  amount: number; currency: string; orderNumber: string; tenantSlug: string; search: string; onSearch: (v: string) => void; onCancel: () => void; onCharged: () => void;
}) {
  const { data: rooms = [], isLoading } = useHotelRooms('occupied');
  const post = useMutation({
    mutationFn: (roomId: string) =>
      hotelApi.postFolioCharge(tenantSlug, roomId, { description: `Bill ${orderNumber}`, amount, charge_type: 'restaurant' }),
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
