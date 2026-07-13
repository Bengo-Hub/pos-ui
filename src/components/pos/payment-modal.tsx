'use client';

import { TreasuryPaymentModal } from '@bengo-hub/shared-ui-lib';
import { cn } from '@/lib/utils';
import {
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Gift,
  Hash,
  Landmark,
  Loader2,
  NotebookPen,
  Smartphone,
  Wallet,
  WifiOff,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useCreatePaymentIntent, useListC2BPayments, useClaimC2BPayment } from '@/hooks/usePOS';
import { useEffectiveOnline } from '@/lib/connectivity';
import { usePaymentStream } from '@/hooks/usePaymentStream';
import { savePendingPayment, getOfflineOrderByLocalId } from '@/lib/db/pos-db';
import { usePOSGateways } from '@/hooks/use-pos-gateways';
import { CreditSaleDetailsModal, type CreditSaleDetails } from '@/components/pos/credit-sale-details-modal';
import { ComplimentarySaleModal } from '@/components/pos/complimentary-sale-modal';
import { ApprovalDialog, type ApprovalResult } from '@/components/pos/approval-dialog';
import { useHotelRooms } from '@/hooks/useHotel';
import { hotelApi, type Room } from '@/lib/api/hotel';

export interface POSPaymentModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  total: number;
  tenantSlug: string;
  tenderId?: string;
  customerEmail?: string;
  isHospitality?: boolean;
  allowedMethods?: string;
  /** Called on a successful payment. `method` is the tender used (cash | mpesa_manual | mpesa |
   *  card | card_manual | wallet | on_account | room_charge) so a split portion can record how it
   *  was paid. */
  onPaymentConfirmed: (method?: string) => void;
}

type ModalStep =
  | 'select'
  | 'cash'
  | 'manual'
  | 'card_pdq'
  | 'c2b'
  | 'treasury'
  | 'room_select'
  | 'room_confirm'
  | 'confirmed'
  | 'offline_queued'
  | 'failed';

export function POSPaymentModal({
  open,
  onClose,
  orderId,
  orderNumber,
  total,
  tenantSlug,
  tenderId = '00000000-0000-0000-0000-000000000000',
  customerEmail,
  isHospitality = false,
  allowedMethods,
  onPaymentConfirmed,
}: POSPaymentModalProps) {
  const roundedTotal = Math.ceil(total);

  const [step, setStep] = useState<ModalStep>('select');
  const [cashTendered, setCashTendered] = useState('');
  const [manualRef, setManualRef] = useState('');
  const [cardRef, setCardRef] = useState('');
  const [intentId, setIntentId] = useState('');
  const [initiateUrl, setInitiateUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomSearch, setRoomSearch] = useState('');
  const [creditDetailsOpen, setCreditDetailsOpen] = useState(false);
  const [complimentaryReasonOpen, setComplimentaryReasonOpen] = useState(false);
  const [complimentaryApprovalOpen, setComplimentaryApprovalOpen] = useState(false);
  const [pendingComplimentaryReason, setPendingComplimentaryReason] = useState('');

  const createIntent = useCreatePaymentIntent();
  const isOnline = useEffectiveOnline();
  const { data: gateways } = usePOSGateways();

  // SSE-based payment detection: fires as soon as pos-api records the payment,
  // eliminating polling latency for M-Pesa STK push confirmations.
  const { status: streamStatus } = usePaymentStream(step === 'treasury' ? orderId : null);
  useEffect(() => {
    if (streamStatus === 'paid' && step === 'treasury') {
      setStep('confirmed');
      onPaymentConfirmed(methodRef.current);
    }
  }, [streamStatus, step, onPaymentConfirmed]);
  const { data: occupiedRooms = [], isLoading: roomsLoading } = useHotelRooms(
    isHospitality && step === 'room_select' ? 'occupied' : undefined
  );

  const postRoomCharge = useMutation({
    mutationFn: ({ roomId }: { roomId: string }) =>
      hotelApi.postFolioCharge(tenantSlug, roomId, {
        description: `Restaurant bill ${orderNumber}`,
        amount: roundedTotal,
        charge_type: 'restaurant',
      }),
  });

  // The tender method of the most recent payment, reported back to the splitter via
  // onPaymentConfirmed(method) so each split portion records how it was paid. A ref (not state)
  // so the async treasury/SSE confirmation path reads the latest value without re-renders.
  const methodRef = useRef<string>('');

  // M-Pesa C2B (paybill/till): poll unreconciled inbox payments matching the active amount, then
  // claim + settle the one the cashier picks.
  const c2bQuery = useListC2BPayments(roundedTotal, open && step === 'c2b' && isOnline);
  const claimC2B = useClaimC2BPayment();
  const handleClaimC2B = useCallback(
    (transID: string) => {
      methodRef.current = 'mpesa';
      claimC2B.mutate(
        { transID, posOrderId: orderId, amount: roundedTotal, tenderId },
        {
          onSuccess: () => { setStep('confirmed'); onPaymentConfirmed(methodRef.current); },
          onError: (err: any) => { setErrorMsg(err?.message ?? 'Could not claim that payment.'); setStep('failed'); },
        }
      );
    },
    [claimC2B, orderId, roundedTotal, tenderId, onPaymentConfirmed]
  );

  useEffect(() => {
    if (open) {
      setStep('select');
      setCashTendered('');
      setManualRef('');
      setCardRef('');
      setIntentId('');
      setInitiateUrl('');
      setErrorMsg('');
      setSelectedRoom(null);
      setRoomSearch('');
      setCreditDetailsOpen(false);
      setComplimentaryReasonOpen(false);
      setComplimentaryApprovalOpen(false);
      setPendingComplimentaryReason('');
    }
  }, [open]);

  // Queue an offline payment, routing it to the right key: if `orderId` is an offline
  // (not-yet-synced) order, attach via local_order_id so the sync worker remaps it to the
  // server order id once the order syncs; otherwise it is a server order paid offline.
  const queueOfflinePayment = useCallback(
    async (method: string, externalRef?: string) => {
      const localOrder = await getOfflineOrderByLocalId(orderId);
      await savePendingPayment({
        server_order_id: localOrder ? undefined : orderId,
        local_order_id: localOrder ? orderId : undefined,
        tender_id: tenderId,
        tender_method: method,
        amount: roundedTotal,
        currency: 'KES',
        external_ref: externalRef,
        tenant_slug: tenantSlug,
        created_at: new Date().toISOString(),
        synced: false,
      });
    },
    [orderId, tenderId, roundedTotal, tenantSlug],
  );

  const handleCashConfirm = useCallback(async () => {
    methodRef.current = 'cash';
    const tendered = parseFloat(cashTendered) || roundedTotal;
    if (tendered < roundedTotal) return;

    if (!isOnline) {
      try {
        await queueOfflinePayment('cash');
        setStep('offline_queued');
        onPaymentConfirmed(methodRef.current);
      } catch {
        setErrorMsg('Failed to save offline payment. Please try again.');
        setStep('failed');
      }
      return;
    }

    createIntent.mutate(
      { orderId, tenderMethod: 'cash', amount: roundedTotal, tenderId },
      {
        onSuccess: () => { setStep('confirmed'); onPaymentConfirmed(methodRef.current); },
        onError: async (err: any) => {
          // Write-behind on weak wifi: cash settles at the till, so a NETWORK failure queues
          // the capture (replay is idempotent) instead of stranding a paid customer.
          const { isNetworkShapedError } = await import('@/lib/connectivity');
          if (isNetworkShapedError(err)) {
            try {
              await queueOfflinePayment('cash');
              setStep('offline_queued');
              onPaymentConfirmed(methodRef.current);
              return;
            } catch { /* fall through to the error state */ }
          }
          setErrorMsg(err?.message ?? 'Cash payment failed. Please try again.');
          setStep('failed');
        },
      }
    );
  }, [cashTendered, roundedTotal, orderId, tenderId, tenantSlug, isOnline, createIntent, onPaymentConfirmed, queueOfflinePayment]);

  // "M-Pesa Code" tender: the customer paid via Paybill/Till and the cashier sights + enters the
  // M-Pesa confirmation code. Recorded as 'mpesa_manual' (NOT the old bare 'manual', which every
  // method breakdown rendered as an unexplained "manual" bucket — pos-api still accepts the legacy
  // string from queued offline payments and canonicalizes it).
  const handleManualConfirm = useCallback(async () => {
    methodRef.current = 'mpesa_manual';
    if (!manualRef.trim()) return;

    if (!isOnline) {
      try {
        await queueOfflinePayment('mpesa_manual', manualRef.trim());
        setStep('offline_queued');
        onPaymentConfirmed(methodRef.current);
      } catch {
        setErrorMsg('Failed to save offline payment. Please try again.');
        setStep('failed');
      }
      return;
    }

    createIntent.mutate(
      { orderId, tenderMethod: 'mpesa_manual', amount: roundedTotal, externalRef: manualRef.trim(), tenderId },
      {
        onSuccess: () => { setStep('confirmed'); onPaymentConfirmed(methodRef.current); },
        onError: async (err: any) => {
          // The cashier already sighted the M-Pesa code — a NETWORK failure queues the
          // capture (verified on sync) instead of stranding the sale.
          const { isNetworkShapedError } = await import('@/lib/connectivity');
          if (isNetworkShapedError(err)) {
            try {
              await queueOfflinePayment('mpesa_manual', manualRef.trim());
              setStep('offline_queued');
              onPaymentConfirmed(methodRef.current);
              return;
            } catch { /* fall through to the error state */ }
          }
          setErrorMsg(err?.message ?? 'Could not verify M-Pesa code. Please check and try again.');
          setStep('failed');
        },
      }
    );
  }, [manualRef, roundedTotal, orderId, tenderId, tenantSlug, isOnline, createIntent, onPaymentConfirmed, queueOfflinePayment]);

  // Card / PDQ: the standalone card terminal already approved the swipe, so it settles immediately
  // like cash (treasury records it as card_manual). Optional approval/reference code is captured.
  const handleCardManualConfirm = useCallback(() => {
    methodRef.current = 'card_manual';
    createIntent.mutate(
      { orderId, tenderMethod: 'card_manual', amount: roundedTotal, externalRef: cardRef.trim() || undefined, tenderId },
      {
        onSuccess: () => { setStep('confirmed'); onPaymentConfirmed(methodRef.current); },
        onError: async (err: any) => {
          // The standalone PDQ already approved the swipe — a NETWORK failure queues the record.
          const { isNetworkShapedError } = await import('@/lib/connectivity');
          if (isNetworkShapedError(err)) {
            try {
              await queueOfflinePayment('card_manual', cardRef.trim() || undefined);
              setStep('offline_queued');
              onPaymentConfirmed(methodRef.current);
              return;
            } catch { /* fall through to the error state */ }
          }
          setErrorMsg(err?.message ?? 'Card payment failed. Please try again.');
          setStep('failed');
        },
      }
    );
  }, [orderId, roundedTotal, cardRef, tenderId, createIntent, onPaymentConfirmed, queueOfflinePayment]);

  const handleDigital = useCallback((method: string) => {
    methodRef.current = method;
    createIntent.mutate(
      { orderId, tenderMethod: method, amount: roundedTotal, tenderId },
      {
        onSuccess: (data) => {
          setIntentId(data.payment_intent_id);
          setInitiateUrl(data.initiate_url);
          setStep('treasury');
        },
        onError: (err: any) => {
          setErrorMsg(err?.message ?? 'Could not initiate payment. Please try again.');
          setStep('failed');
        },
      }
    );
  }, [orderId, roundedTotal, tenderId, createIntent]);

  // On Account (credit sale): first capture the credit terms (reusable CreditSaleDetailsModal —
  // due date defaults to +30 days, optional notes), then the backend posts to the customer's
  // treasury AR balance (credit limit enforced) and settles the order immediately.
  const handleOnAccount = useCallback(() => setCreditDetailsOpen(true), []);

  const handleOnAccountConfirm = useCallback((details: CreditSaleDetails) => {
    methodRef.current = 'on_account';
    createIntent.mutate(
      {
        orderId, tenderMethod: 'on_account', amount: roundedTotal, tenderId,
        paymentDueDate: details.dueDate, creditNotes: details.notes || undefined,
      },
      {
        onSuccess: () => { setCreditDetailsOpen(false); setStep('confirmed'); onPaymentConfirmed(methodRef.current); },
        onError: (err: any) => {
          setCreditDetailsOpen(false);
          setErrorMsg((err as { normalizedMessage?: string })?.normalizedMessage ?? err?.message ?? 'Could not charge to account — check the customer and their credit limit.');
          setStep('failed');
        },
      }
    );
  }, [orderId, roundedTotal, tenderId, createIntent, onPaymentConfirmed]);

  // Complimentary (no-charge): reason first, then MANDATORY manager approval every time (scan
  // card, PIN, or a one-time code a manager shared) — unlike Void, there is no self-approve
  // bypass for managers-as-cashier here; the backend hard-requires an approval token/code
  // regardless of the caller's own role, since a comp is a real, unrecovered inventory cost.
  const handleComplimentary = useCallback(() => setComplimentaryReasonOpen(true), []);

  const handleComplimentaryReasonConfirm = useCallback((reason: string) => {
    setPendingComplimentaryReason(reason);
    setComplimentaryReasonOpen(false);
    setComplimentaryApprovalOpen(true);
  }, []);

  const handleComplimentaryApproved = useCallback((approval: ApprovalResult) => {
    setComplimentaryApprovalOpen(false);
    methodRef.current = 'complimentary';
    createIntent.mutate(
      {
        orderId, tenderMethod: 'complimentary', amount: roundedTotal, tenderId,
        reason: pendingComplimentaryReason,
        approvalToken: approval.approvalToken,
        approvalCode: approval.code,
      },
      {
        onSuccess: () => { setStep('confirmed'); onPaymentConfirmed(methodRef.current); },
        onError: (err: any) => {
          setErrorMsg((err as { normalizedMessage?: string })?.normalizedMessage ?? err?.message ?? 'Could not close the bill as complimentary — check the approval and try again.');
          setStep('failed');
        },
      }
    );
  }, [orderId, roundedTotal, tenderId, createIntent, onPaymentConfirmed, pendingComplimentaryReason]);

  const handleRoomCharge = useCallback(() => {
    methodRef.current = 'room_charge';
    if (!selectedRoom) return;
    postRoomCharge.mutate(
      { roomId: selectedRoom.id },
      {
        onSuccess: () => { setStep('confirmed'); onPaymentConfirmed(methodRef.current); },
        onError: (err: any) => {
          setErrorMsg(err?.message ?? 'Failed to post charge to room. Please try again.');
          setStep('failed');
        },
      }
    );
  }, [selectedRoom, postRoomCharge, onPaymentConfirmed]);

  const change = (parseFloat(cashTendered) || 0) - roundedTotal;

  const filteredRooms = occupiedRooms.filter((r) =>
    !roomSearch ||
    r.room_number.toLowerCase().includes(roomSearch.toLowerCase()) ||
    (r.edges?.guests?.[0]?.guest_name ?? '').toLowerCase().includes(roomSearch.toLowerCase())
  );

  if (!open) return null;

  // Online gateway handoff (M-Pesa STK / Paystack / Wallet): render the treasury pay flow as the
  // SOLE modal — never stacked on top of the settle sheet — so selecting an online method doesn't
  // pop a second blocking modal over this one. On confirm/fail/cancel the step changes and the
  // settle sheet below takes over again (success / failed / back to method select).
  if (step === 'treasury' && intentId) {
    return (
      <TreasuryPaymentModal
        open={true}
        onOpenChange={(isOpen) => { if (!isOpen) setStep('select'); }}
        paymentIntentId={intentId}
        tenantSlug={tenantSlug}
        initiateUrl={initiateUrl}
        amount={roundedTotal}
        currency="KES"
        description={`Order ${orderNumber}`}
        customerEmail={customerEmail}
        allowedMethods={allowedMethods}
        referenceId={orderId}
        referenceType="pos_order"
        onPaymentConfirmed={() => { setStep('confirmed'); onPaymentConfirmed(methodRef.current); }}
        onPaymentFailed={(err) => {
          setErrorMsg(typeof err === 'string' ? err : 'Payment was declined or failed.');
          setStep('failed');
        }}
      />
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-card rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">

          {/* ── Purple amount banner ─────────────────────────────────── */}
          <div className="relative bg-gradient-to-br from-violet-600 to-purple-700 px-6 pt-6 pb-5">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <X className="h-4 w-4 text-white" />
            </button>
            <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">
              {step === 'select' ? 'Settle Bill' :
               step === 'cash' ? 'Cash Payment' :
               step === 'manual' ? 'M-Pesa Reference' :
               step === 'card_pdq' ? 'Card / PDQ' :
               step === 'room_select' || step === 'room_confirm' ? 'Room Charge' :
               step === 'confirmed' ? 'Payment Successful' :
               step === 'offline_queued' ? 'Payment Queued' :
               step === 'failed' ? 'Payment Failed' : 'Payment'}
            </p>
            <p className="text-white text-4xl font-extrabold tabular-nums leading-none">
              KES {roundedTotal.toLocaleString()}
            </p>
            <p className="text-white/60 text-xs mt-1">{orderNumber}</p>
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ── Method selection ─────────────────────────────────────── */}
            {step === 'select' && (
              <div className="p-6 space-y-5">

                {/* ── Always-available methods (badge pills) ───────────── */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
                    Always available
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    <PayBadge
                      icon={<Banknote className="h-4 w-4" />}
                      color="text-emerald-600"
                      bg="bg-emerald-500/10"
                      label="Cash"
                      sub="Accept cash"
                      disabled={false}
                      loading={false}
                      onClick={() => { setCashTendered(String(roundedTotal)); setStep('cash'); }}
                    />
                    <PayBadge
                      icon={<Hash className="h-4 w-4" />}
                      color="text-yellow-600"
                      bg="bg-yellow-500/10"
                      label="M-Pesa Code"
                      sub="Enter ref code"
                      disabled={false}
                      loading={false}
                      onClick={() => setStep('manual')}
                    />
                    <PayBadge
                      icon={<CreditCard className="h-4 w-4" />}
                      color="text-blue-600"
                      bg="bg-blue-500/10"
                      label="Card (PDQ)"
                      sub="Swipe on terminal"
                      disabled={false}
                      loading={false}
                      onClick={() => setStep('card_pdq')}
                    />
                    <PayBadge
                      icon={<NotebookPen className="h-4 w-4" />}
                      color="text-orange-600"
                      bg="bg-orange-500/10"
                      label="On Account"
                      sub="Credit sale (AR)"
                      disabled={!isOnline}
                      loading={createIntent.isPending}
                      offlineBadge={!isOnline}
                      onClick={handleOnAccount}
                    />
                    {gateways?.complimentary && (
                      <PayBadge
                        icon={<Gift className="h-4 w-4" />}
                        color="text-pink-600"
                        bg="bg-pink-500/10"
                        label="Complimentary"
                        sub="No charge"
                        disabled={false}
                        loading={createIntent.isPending}
                        onClick={handleComplimentary}
                      />
                    )}
                    {isHospitality && (
                      <PayBadge
                        icon={<Building2 className="h-4 w-4" />}
                        color="text-indigo-600"
                        bg="bg-indigo-500/10"
                        label="Room"
                        sub="Charge to room"
                        disabled={!isOnline}
                        loading={false}
                        offlineBadge={!isOnline}
                        onClick={() => setStep('room_select')}
                      />
                    )}
                  </div>
                </div>

                {/* ── Online gateways (treasury-synced) ────────────────── */}
                {isOnline && (gateways?.mpesa || gateways?.paystack || gateways?.wallet) && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5 flex items-center gap-1.5">
                      <Zap className="h-3 w-3 text-primary" />
                      Online payments
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      {gateways?.mpesa && (
                        <PayBadge
                          icon={<Smartphone className="h-4 w-4" />}
                          color="text-green-600"
                          bg="bg-green-500/10"
                          label="M-Pesa STK"
                          sub="Prompt to phone"
                          disabled={false}
                          loading={createIntent.isPending}
                          onClick={() => handleDigital('mpesa')}
                        />
                      )}
                      {gateways?.mpesa && (
                        <PayBadge
                          icon={<Landmark className="h-4 w-4" />}
                          color="text-green-700"
                          bg="bg-green-500/10"
                          label="M-Pesa Paybill"
                          sub="Match till / paybill"
                          disabled={false}
                          loading={false}
                          onClick={() => setStep('c2b')}
                        />
                      )}
                      {gateways?.paystack && (
                        <PayBadge
                          icon={<CreditCard className="h-4 w-4" />}
                          color="text-blue-600"
                          bg="bg-blue-500/10"
                          label="Card / M-Pesa"
                          sub="Paystack — prompts customer"
                          disabled={false}
                          loading={createIntent.isPending}
                          onClick={() => handleDigital('card')}
                        />
                      )}
                      {gateways?.wallet && (
                        <PayBadge
                          icon={<Wallet className="h-4 w-4" />}
                          color="text-purple-600"
                          bg="bg-purple-500/10"
                          label="Wallet"
                          sub="Airtel Money & more"
                          disabled={false}
                          loading={createIntent.isPending}
                          onClick={() => handleDigital('wallet')}
                        />
                      )}
                    </div>
                  </div>
                )}

                {!isOnline && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-400/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-400 font-medium">
                    <WifiOff className="h-4 w-4 shrink-0" />
                    Offline — cash &amp; M-Pesa code entry available. Online gateways will appear when reconnected.
                  </div>
                )}
              </div>
            )}

            {/* ── Cash tendered ─────────────────────────────────────────── */}
            {step === 'cash' && (
              <div className="p-5 space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Cash Tendered (KES)</span>
                  <input
                    type="number"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    className="mt-1 w-full bg-background border border-border rounded-xl py-3 px-4 text-2xl font-bold focus:ring-2 focus:ring-primary/40 focus:outline-none tabular-nums"
                    autoFocus
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[roundedTotal, Math.ceil(roundedTotal / 100) * 100, Math.ceil(roundedTotal / 500) * 500]
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCashTendered(String(amt))}
                        className={cn(
                          'py-2 rounded-xl border text-sm font-semibold transition-all',
                          parseFloat(cashTendered) === amt
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/40'
                        )}
                      >
                        {amt.toLocaleString()}
                      </button>
                    ))}
                </div>
                {change >= 0 && (
                  <div className="flex justify-between text-sm rounded-xl bg-green-500/10 px-4 py-3">
                    <span className="text-muted-foreground font-medium">Change</span>
                    <span className="font-bold text-green-600 tabular-nums">KES {change.toLocaleString()}</span>
                  </div>
                )}
                {!isOnline && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400 font-medium">
                    <WifiOff className="h-4 w-4 shrink-0" />
                    Offline — will sync when connection is restored.
                  </div>
                )}
                <button
                  onClick={handleCashConfirm}
                  disabled={parseFloat(cashTendered) < roundedTotal || createIntent.isPending}
                  className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-primary/90 transition-colors"
                >
                  {createIntent.isPending
                    ? <Loader2 className="h-5 w-5 animate-spin" />
                    : <CheckCircle2 className="h-5 w-5" />}
                  {isOnline ? 'Confirm Cash' : 'Save & Sync Later'}
                </button>
                <button onClick={() => setStep('select')} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  ← Back
                </button>
              </div>
            )}

            {/* ── M-Pesa reference (offline code entry) ─────────────────── */}
            {step === 'manual' && (
              <div className="p-5 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter the M-Pesa transaction code from the customer&apos;s SMS (paybill or till number payment).
                </p>
                {!isOnline && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400 font-medium">
                    <WifiOff className="h-4 w-4 shrink-0" />
                    Offline — code saved locally and verified when connection is restored.
                  </div>
                )}
                <label className="block">
                  <span className="text-sm font-medium text-foreground">M-Pesa Code</span>
                  <input
                    type="text"
                    placeholder="e.g. QB234ABCDE"
                    value={manualRef}
                    onChange={(e) => setManualRef(e.target.value.toUpperCase())}
                    className="mt-1 w-full bg-background border border-border rounded-xl py-3 px-4 text-xl font-bold tracking-widest uppercase focus:ring-2 focus:ring-primary/40 focus:outline-none"
                    autoFocus
                    maxLength={20}
                  />
                </label>
                <button
                  onClick={handleManualConfirm}
                  disabled={!manualRef.trim() || createIntent.isPending}
                  className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-primary/90 transition-colors"
                >
                  {createIntent.isPending
                    ? <Loader2 className="h-5 w-5 animate-spin" />
                    : <CheckCircle2 className="h-5 w-5" />}
                  {isOnline ? 'Confirm M-Pesa' : 'Record & Verify Later'}
                </button>
                <button onClick={() => setStep('select')} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  ← Back
                </button>
              </div>
            )}

            {/* ── Card / PDQ (external terminal — settles immediately) ──────── */}
            {step === 'card_pdq' && (
              <div className="p-5 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Run the card on your PDQ / card machine, then record the approval / reference code (optional).
                </p>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Approval / Ref code</span>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={cardRef}
                    onChange={(e) => setCardRef(e.target.value.toUpperCase())}
                    className="mt-1 w-full bg-background border border-border rounded-xl py-3 px-4 text-lg font-bold tracking-wide uppercase focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
                    autoFocus
                    maxLength={32}
                  />
                </label>
                <button
                  onClick={handleCardManualConfirm}
                  disabled={createIntent.isPending}
                  className="w-full min-h-12 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-blue-700 transition-colors"
                >
                  {createIntent.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                  Confirm Card Payment
                </button>
                <button onClick={() => setStep('select')} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  ← Back
                </button>
              </div>
            )}

            {/* ── M-Pesa C2B (paybill / till reconciliation) ───────────────── */}
            {step === 'c2b' && (
              <div className="p-5 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Match the customer&apos;s M-Pesa paybill/till payment to this sale. Showing unreconciled
                  payments of KES {roundedTotal.toLocaleString()}.
                </p>
                {c2bQuery.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : (c2bQuery.data?.candidates?.length ?? 0) === 0 ? (
                  <div className="rounded-xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                    No matching payment yet. Ask the customer to pay to your paybill/till — it will
                    appear here automatically.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {c2bQuery.data!.candidates.map((c) => (
                      <button
                        key={c.trans_id}
                        type="button"
                        disabled={claimC2B.isPending}
                        onClick={() => handleClaimC2B(c.trans_id)}
                        className="w-full flex items-center justify-between gap-3 rounded-xl border border-border hover:border-primary/50 hover:bg-accent px-4 py-3 text-left transition-colors disabled:opacity-50"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{c.payer_name || c.msisdn || 'M-Pesa payer'}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {c.trans_id}{c.bill_ref_number ? ` · ${c.bill_ref_number}` : ''}
                          </p>
                        </div>
                        <span className="font-bold text-sm tabular-nums shrink-0">
                          KES {parseFloat(String(c.amount)).toLocaleString()}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {claimC2B.isPending && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Settling…
                  </div>
                )}
                <button onClick={() => setStep('select')} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  ← Back
                </button>
              </div>
            )}

            {/* ── Room select ───────────────────────────────────────────── */}
            {step === 'room_select' && (
              <div className="p-5 space-y-3">
                <p className="text-sm text-muted-foreground">Select the occupied room to post this bill to:</p>
                <input
                  type="text"
                  placeholder="Search room or guest name…"
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  className="w-full bg-accent/30 border-none rounded-xl py-2 px-4 text-sm focus:ring-1 focus:ring-primary transition-all"
                  autoFocus
                />
                {roomsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : filteredRooms.length === 0 ? (
                  <p className="text-center py-8 text-sm text-muted-foreground">No occupied rooms found.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {filteredRooms.map((room) => {
                      const guest = room.edges?.guests?.[0];
                      return (
                        <button
                          key={room.id}
                          onClick={() => { setSelectedRoom(room); setStep('room_confirm'); }}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all text-left"
                        >
                          <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                            <Building2 className="h-5 w-5 text-indigo-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm">Room {room.room_number}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {guest?.guest_name ?? room.room_type}
                            </p>
                          </div>
                          <span className="text-xs bg-emerald-500/10 text-emerald-600 font-semibold px-2 py-0.5 rounded-full">
                            Occupied
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <button onClick={() => setStep('select')} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  ← Back
                </button>
              </div>
            )}

            {/* ── Room charge confirm ───────────────────────────────────── */}
            {step === 'room_confirm' && selectedRoom && (
              <div className="p-5 space-y-4">
                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">Room {selectedRoom.room_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedRoom.edges?.guests?.[0]?.guest_name ?? selectedRoom.room_type}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-indigo-500/10 pt-3 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Order</span>
                      <span className="font-medium">{orderNumber}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-bold text-base">KES {roundedTotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Charge type</span>
                      <span className="font-medium">Restaurant</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  This charge will be added to the room folio and settled at checkout.
                </p>
                <button
                  onClick={handleRoomCharge}
                  disabled={postRoomCharge.isPending}
                  className="w-full min-h-12 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-indigo-700 transition-colors"
                >
                  {postRoomCharge.isPending
                    ? <Loader2 className="h-5 w-5 animate-spin" />
                    : <Building2 className="h-5 w-5" />}
                  Post to Room {selectedRoom.room_number}
                </button>
                <button onClick={() => setStep('room_select')} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  ← Choose different room
                </button>
              </div>
            )}

            {/* ── Confirmed ─────────────────────────────────────────────── */}
            {step === 'confirmed' && (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                </div>
                <h3 className="text-xl font-bold mb-1">Payment Successful</h3>
                <p className="text-sm text-muted-foreground">Order {orderNumber} has been settled.</p>
                <p className="text-2xl font-bold text-foreground mt-2 tabular-nums">
                  KES {roundedTotal.toLocaleString()}
                </p>
                <button
                  onClick={onClose}
                  className="mt-6 px-8 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            {/* ── Offline queued ────────────────────────────────────────── */}
            {step === 'offline_queued' && (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="h-20 w-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
                  <Clock className="h-10 w-10 text-amber-500" />
                </div>
                <h3 className="text-xl font-bold mb-1">Payment Queued</h3>
                <p className="text-sm text-muted-foreground">
                  You are offline. Payment for {orderNumber} saved locally — syncs automatically when reconnected.
                </p>
                <button
                  onClick={onClose}
                  className="mt-6 px-8 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            {/* ── Failed ────────────────────────────────────────────────── */}
            {step === 'failed' && (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                  <XCircle className="h-10 w-10 text-destructive" />
                </div>
                <h3 className="text-xl font-bold mb-1">Payment Failed</h3>
                <p className="text-sm text-muted-foreground">
                  {errorMsg || 'Something went wrong. Please try again or choose a different method.'}
                </p>
                <button
                  onClick={() => setStep('select')}
                  className="mt-6 px-8 py-2.5 rounded-xl border border-border font-bold hover:bg-accent transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Credit-sale terms capture (due date default +30d, notes) — shared component. */}
      <CreditSaleDetailsModal
        open={creditDetailsOpen}
        amountLabel={`KES ${roundedTotal.toLocaleString()}`}
        loading={createIntent.isPending}
        onCancel={() => setCreditDetailsOpen(false)}
        onConfirm={handleOnAccountConfirm}
      />

      {/* Complimentary (no-charge): reason first... */}
      <ComplimentarySaleModal
        open={complimentaryReasonOpen}
        orderNumber={orderNumber}
        amountLabel={`KES ${roundedTotal.toLocaleString()}`}
        onClose={() => setComplimentaryReasonOpen(false)}
        onConfirm={handleComplimentaryReasonConfirm}
      />
      {/* ...then MANDATORY manager approval (scan card / PIN / one-time code) — always shown, no
          self-approve shortcut, since this books a real, unrecovered inventory cost. */}
      <ApprovalDialog
        open={complimentaryApprovalOpen}
        action="order.complimentary"
        description={`A manager must approve closing bill #${orderNumber} as complimentary.`}
        confirmLabel="Authorize complimentary"
        onApproved={handleComplimentaryApproved}
        onClose={() => setComplimentaryApprovalOpen(false)}
      />
    </>
  );
}

// Compact badge-style payment option: a rounded pill with a small toned icon chip + label/sub
// inline. Replaces the old large card tiles so the method list reads as one organised row of
// badges rather than a grid of bulky cards.
function PayBadge({
  icon, color, bg, label, sub, disabled, loading, offlineBadge, onClick,
}: {
  icon: React.ReactNode;
  color: string;
  bg: string;
  label: string;
  sub: string;
  disabled: boolean;
  loading: boolean;
  offlineBadge?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={offlineBadge ? 'Requires internet' : sub}
      className={cn(
        'group inline-flex items-center gap-2.5 rounded-full border pl-2 pr-4 py-1.5 transition-all active:scale-95',
        disabled || loading
          ? 'border-border opacity-40 cursor-not-allowed'
          : 'border-border hover:border-primary/50 hover:bg-accent/40'
      )}
    >
      <span className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0', bg, color)}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      </span>
      <span className="text-left leading-tight">
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-[10px] text-muted-foreground">
          {offlineBadge ? 'Requires internet' : sub}
        </span>
      </span>
    </button>
  );
}
