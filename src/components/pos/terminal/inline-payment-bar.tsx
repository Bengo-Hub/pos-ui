'use client';

/**
 * GoDigital-style inline POS action bar — renders the payment methods directly on the order page
 * (no separate "select a method" modal). Immediate tenders (Cash, Card/PDQ, Credit) capture inline;
 * online gateway tenders (M-Pesa Express, Paystack card, Wallet) hand off to the treasury pay flow;
 * M-Pesa Paybill/Till reconciles via the C2B match panel; Room charge posts to a guest folio.
 *
 * The bar owns the full settle flow but never creates the order itself — the page provides
 * `createOrderAsync()` (which runs all order validation + creation) so the bar can settle against a
 * real order id. For dine-in the page passes mode="send_to_kitchen" and the bar shows a single
 * Send-to-Kitchen button instead of tender buttons (payment happens later from the bill).
 */

import { TreasuryPaymentModal } from '@bengo-hub/shared-ui-lib';
import { cn } from '@/lib/utils';
import {
  Banknote, ChefHat, CreditCard, FileText, Hash, Landmark, Loader2, NotebookPen,
  Building2, Smartphone, Truck, Wallet, SplitSquareHorizontal, X, CheckCircle2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useCreatePaymentIntent, useListC2BPayments, useClaimC2BPayment } from '@/hooks/usePOS';
import { useOnline } from '@/hooks/use-online';
import { useCashDrawer } from '@/hooks/useCashDrawer';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { usePOSGateways } from '@/hooks/use-pos-gateways';
import { useHotelRooms } from '@/hooks/useHotel';
import { hotelApi } from '@/lib/api/hotel';
import type { TerminalProfile } from '@/lib/use-case-config';
import {
  paymentActionsFor, tenderMethodFor, isImmediateTender, type TenderKey, type TenderTone,
} from '@/lib/pos/terminal-actions';
import { toast } from 'sonner';

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
};

function tenderIcon(key: TenderKey) {
  switch (key) {
    case 'cash': return Banknote;
    case 'card_pdq': return CreditCard;
    case 'card_online': return CreditCard;
    case 'mpesa_stk': return Smartphone;
    case 'mpesa_c2b': return Landmark;
    case 'wallet': return Wallet;
    case 'on_account': return NotebookPen;
    case 'cod': return Truck;
    case 'room': return Building2;
    case 'split': return SplitSquareHorizontal;
    default: return CreditCard;
  }
}

export function InlinePaymentBar(props: InlinePaymentBarProps) {
  const {
    total, tenantSlug, profile, isHospitality, allowCOD = false, customerEmail,
    tenderId = NIL_TENDER, disabled = false, mode = 'pay', layout = 'panel',
    createOrderAsync, onSettled, onDraft, onQuotation, onCancel, onSplit,
  } = props;

  const roundedTotal = Math.max(0, Math.ceil(total));
  const isOnline = useOnline();
  const { data: gateways } = usePOSGateways();
  const { data: posSettings } = usePOSSettings();
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

  const actions = useMemo(
    () => paymentActionsFor(profile, gateways, { isHospitality, isOnline, allowCOD }),
    [profile, gateways, isHospitality, isOnline, allowCOD],
  );
  // Back-office profiles (retail/pharmacy/services) get Draft + Quotation; hospitality/QSR do not.
  const isBackOffice = profile === 'retail' || profile === 'pharmacy' || profile === 'services';

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
  const settleImmediate = useCallback(async (key: TenderKey, externalRef?: string) => {
    setBusyKey(key);
    const ord = await ensureOrder();
    if (!ord) { setBusyKey(null); return; }
    const method = tenderMethodFor(key);
    createIntent.mutate(
      { orderId: ord.orderId, tenderMethod: method, amount: roundedTotal, tenderId, externalRef },
      {
        onSuccess: () => { autoOpenOnSettle(method); finish(ord); },
        onError: (e: any) => {
          setBusyKey(null);
          toast.error(e?.message ?? 'Payment failed. Please try again.');
        },
      },
    );
  }, [ensureOrder, createIntent, roundedTotal, tenderId, finish, autoOpenOnSettle]);

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
        onError: (e: any) => {
          setBusyKey(null);
          toast.error(e?.message ?? 'Could not start payment. Please try again.');
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
      case 'on_account':
        await settleImmediate('on_account');
        return;
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
    }
  }, [roundedTotal, settleImmediate, ensureOrder, startGateway, finish, onSplit]);

  // ── Send to Kitchen (dine-in) ────────────────────────────────────────────────
  const sendToKitchen = useCallback(async () => {
    setBusyKey('cash');
    const ord = await createOrderAsync();
    setBusyKey(null);
    if (ord) finish(ord, { unpaid: true });
  }, [createOrderAsync, finish]);

  const fmt = (n: number) => `KES ${n.toLocaleString()}`;
  const anyBusy = busyKey !== null || createIntent.isPending;

  return (
    <div className="border-t border-border bg-card/95 backdrop-blur">
      {/* ── Inline capture surfaces ────────────────────────────────────────── */}
      {capture === 'cash' && (
        <CashCapture
          total={roundedTotal}
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
          value={cardRef}
          onChange={setCardRef}
          requireRef={requireCardRef}
          busy={anyBusy}
          onCancel={reset}
          onConfirm={() => settleImmediate('card_pdq', cardRef.trim() || undefined)}
        />
      )}
      {capture === 'mpesa_c2b' && order && (
        <C2BCapture
          amount={roundedTotal}
          orderId={order.orderId}
          tenderId={tenderId}
          isOnline={isOnline}
          onCancel={reset}
          onClaimed={() => finish(order)}
        />
      )}
      {capture === 'room' && order && (
        <RoomCapture
          amount={roundedTotal}
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
          currency="KES"
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
            Send to Kitchen
          </button>
        </div>
      ) : layout === 'bar' ? (
        /* GoDigital compact horizontal action bar — tenders render as modern pill BADGES (soft toned
           bg + tone text, icon + label inline), Draft/Quotation as neutral badges, Cancel red, and
           the Total Payable pinned right. */
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          {isBackOffice && <BadgeBtn icon={FileText} label="Draft" onClick={onDraft} disabled={disabled || anyBusy} />}
          {isBackOffice && <BadgeBtn icon={FileText} label="Quotation" onClick={onQuotation} disabled={anyBusy} />}
          {actions.map((a) => {
            const Icon = tenderIcon(a.key);
            const tone = TONES[a.tone];
            const isBusy = busyKey === a.key;
            return (
              <button
                key={a.key}
                type="button"
                disabled={disabled || anyBusy}
                onClick={() => onPick(a.key)}
                title={a.sublabel}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all',
                  'hover:brightness-95 active:scale-95 disabled:opacity-40 disabled:pointer-events-none',
                  tone.bg, tone.text,
                )}
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4 shrink-0" />}
                <span className="whitespace-nowrap">{a.label}</span>
              </button>
            );
          })}
          <BadgeBtn icon={X} label="Cancel" tone="danger" onClick={onCancel} disabled={anyBusy} />
          <div className="ml-auto flex items-center gap-2 pl-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Total Payable</span>
            <span className="text-xl font-extrabold tabular-nums text-emerald-600">{fmt(roundedTotal)}</span>
          </div>
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
                return (
                  <button
                    key={a.key}
                    type="button"
                    disabled={disabled || anyBusy}
                    onClick={() => onPick(a.key)}
                    title={a.sublabel}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl border-2 border-border transition-all active:scale-95 disabled:opacity-40 min-h-20',
                      tone.ring,
                    )}
                  >
                    <span className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', tone.bg, tone.text)}>
                      {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
                    </span>
                    <span className="text-xs font-bold text-center leading-tight">{a.label}</span>
                  </button>
                );
              })}
            </div>
            {/* Secondary workflow actions. Draft/Quotation are retail/back-office concepts — hospitality
                & QSR hold orders on tables / send to kitchen, so only Cancel shows there. */}
            <div className={cn('grid gap-2 pt-1', isBackOffice ? 'grid-cols-3' : 'grid-cols-1')}>
              {isBackOffice && <SecondaryBtn icon={FileText} label="Draft" onClick={onDraft} disabled={disabled || anyBusy} />}
              {isBackOffice && <SecondaryBtn icon={FileText} label="Quotation" onClick={onQuotation} disabled={anyBusy} />}
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
        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all',
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
function CashCapture({ total, value, onChange, busy, onConfirm, onCancel }: {
  total: number; value: string; onChange: (v: string) => void; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const change = (parseFloat(value) || 0) - total;
  const quick = [total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div className="p-3 border-b border-border bg-emerald-500/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Cash · {`KES ${total.toLocaleString()}`}</span>
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
          <span className="font-bold text-emerald-600 tabular-nums">KES {change.toLocaleString()}</span>
        </div>
      )}
      <button
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
function CardRefCapture({ total, value, requireRef, onChange, busy, onConfirm, onCancel }: {
  total: number; value: string; requireRef: boolean; onChange: (v: string) => void; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const refMissing = requireRef && value.trim() === '';
  return (
    <div className="p-3 border-b border-border bg-blue-500/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Card / PDQ · {`KES ${total.toLocaleString()}`}</span>
        <button onClick={onCancel} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent"><X className="h-4 w-4" /></button>
      </div>
      <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-0.5">
        <li>Run the card on the PDQ terminal for <span className="font-semibold text-foreground">KES {total.toLocaleString()}</span>.</li>
        <li>Wait for the terminal to show <span className="font-semibold text-emerald-600">APPROVED</span>.</li>
        <li>Enter the approval / reference code below{requireRef ? '' : ' (optional)'}, then Confirm.</li>
      </ol>
      <input
        type="text" autoFocus value={value}
        placeholder={requireRef ? 'Approval / Ref code (required)' : 'Approval / Ref code (optional)'}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onKeyDown={(e) => { if (e.key === 'Enter' && !refMissing && !busy) onConfirm(); }}
        className="w-full bg-background border border-border rounded-xl py-2.5 px-3 text-base font-semibold tracking-wide uppercase focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
      />
      {refMissing && <p className="text-[11px] text-amber-600">This outlet requires the PDQ approval code before confirming.</p>}
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

// ── Inline M-Pesa Paybill/Till (C2B) reconciliation ─────────────────────────────
function C2BCapture({ amount, orderId, tenderId, isOnline, onCancel, onClaimed }: {
  amount: number; orderId: string; tenderId: string; isOnline: boolean; onCancel: () => void; onClaimed: () => void;
}) {
  const c2bQuery = useListC2BPayments(amount, isOnline);
  const claimC2B = useClaimC2BPayment();
  const candidates = c2bQuery.data?.candidates ?? [];
  return (
    <div className="p-3 border-b border-border bg-green-500/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">M-Pesa Paybill / Till · KES {amount.toLocaleString()}</span>
        <button onClick={onCancel} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent"><X className="h-4 w-4" /></button>
      </div>
      <p className="text-xs text-muted-foreground">Match the customer&apos;s payment to this sale.</p>
      {c2bQuery.isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-green-600" /></div>
      ) : candidates.length === 0 ? (
        <p className="rounded-lg bg-muted/40 px-3 py-3 text-center text-xs text-muted-foreground">
          No matching payment yet — it appears here automatically once received.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {candidates.map((c: any) => (
            <button
              key={c.trans_id} type="button" disabled={claimC2B.isPending}
              onClick={() => claimC2B.mutate(
                { transID: c.trans_id, posOrderId: orderId, amount, tenderId },
                { onSuccess: onClaimed, onError: (e: any) => toast.error(e?.message ?? 'Could not match that payment.') },
              )}
              className="w-full flex items-center justify-between gap-3 rounded-lg border border-border hover:border-green-500/50 px-3 py-2 text-left disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold truncate">{c.payer_name || c.msisdn || 'M-Pesa payer'}</span>
                <span className="block text-[10px] text-muted-foreground truncate">{c.trans_id}</span>
              </span>
              <span className="text-sm font-bold tabular-nums shrink-0">KES {parseFloat(String(c.amount)).toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inline room-charge picker (hospitality) ─────────────────────────────────────
function RoomCapture({ amount, orderNumber, tenantSlug, search, onSearch, onCancel, onCharged }: {
  amount: number; orderNumber: string; tenantSlug: string; search: string; onSearch: (v: string) => void; onCancel: () => void; onCharged: () => void;
}) {
  const { data: rooms = [], isLoading } = useHotelRooms('occupied');
  const post = useMutation({
    mutationFn: (roomId: string) =>
      hotelApi.postFolioCharge(tenantSlug, roomId, { description: `Bill ${orderNumber}`, amount, charge_type: 'restaurant' }),
    onSuccess: onCharged,
    onError: (e: any) => toast.error(e?.message ?? 'Failed to post charge to room.'),
  });
  const filtered = rooms.filter((r: any) =>
    !search || r.room_number?.toLowerCase().includes(search.toLowerCase()) ||
    (r.edges?.guests?.[0]?.guest_name ?? '').toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="p-3 border-b border-border bg-indigo-500/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Charge to Room · KES {amount.toLocaleString()}</span>
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
