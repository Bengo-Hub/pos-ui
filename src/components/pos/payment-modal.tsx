'use client';

import { TreasuryPaymentModal } from '@bengo-hub/shared-ui-lib';
import { cn } from '@/lib/utils';
import {
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Hash,
  Loader2,
  Minus,
  Plus,
  Smartphone,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useCreatePaymentIntent } from '@/hooks/usePOS';
import { useOnline } from '@/hooks/use-online';
import { savePendingPayment } from '@/lib/db/pos-db';
import { usePOSGateways } from '@/hooks/use-pos-gateways';
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
  onPaymentConfirmed: () => void;
}

type ModalStep =
  | 'select'
  | 'mpesa_choice'
  | 'cash'
  | 'manual'
  | 'treasury'
  | 'room_select'
  | 'room_confirm'
  | 'confirmed'
  | 'offline_queued'
  | 'failed';

type PayMode = 'full' | 'split';

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
  const [payMode, setPayMode] = useState<PayMode>('full');
  const [splitCount, setSplitCount] = useState(2);
  const [cashTendered, setCashTendered] = useState('');
  const [manualRef, setManualRef] = useState('');
  const [intentId, setIntentId] = useState('');
  const [initiateUrl, setInitiateUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomSearch, setRoomSearch] = useState('');

  const createIntent = useCreatePaymentIntent();
  const isOnline = useOnline();
  const { data: gateways } = usePOSGateways();
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

  const splitAmount = useMemo(() => Math.ceil(roundedTotal / splitCount), [roundedTotal, splitCount]);
  const activeAmount = payMode === 'split' ? splitAmount : roundedTotal;

  useEffect(() => {
    if (open) {
      setStep('select');
      setPayMode('full');
      setSplitCount(2);
      setCashTendered('');
      setManualRef('');
      setIntentId('');
      setInitiateUrl('');
      setErrorMsg('');
      setSelectedRoom(null);
      setRoomSearch('');
    }
  }, [open]);

  const handleCashConfirm = useCallback(async () => {
    const tendered = parseFloat(cashTendered) || activeAmount;
    if (tendered < activeAmount) return;

    if (!isOnline) {
      try {
        await savePendingPayment({
          server_order_id: orderId,
          tender_id: tenderId,
          tender_method: 'cash',
          amount: roundedTotal,
          currency: 'KES',
          tenant_slug: tenantSlug,
          created_at: new Date().toISOString(),
          synced: false,
        });
        setStep('offline_queued');
        onPaymentConfirmed();
      } catch {
        setErrorMsg('Failed to save offline payment. Please try again.');
        setStep('failed');
      }
      return;
    }

    createIntent.mutate(
      { orderId, tenderMethod: 'cash', amount: roundedTotal },
      {
        onSuccess: () => { setStep('confirmed'); onPaymentConfirmed(); },
        onError: (err: any) => {
          setErrorMsg(err?.message ?? 'Cash payment failed. Please try again.');
          setStep('failed');
        },
      }
    );
  }, [cashTendered, activeAmount, roundedTotal, orderId, tenderId, tenantSlug, isOnline, createIntent, onPaymentConfirmed]);

  const handleManualConfirm = useCallback(async () => {
    if (!manualRef.trim()) return;

    if (!isOnline) {
      try {
        await savePendingPayment({
          server_order_id: orderId,
          tender_id: tenderId,
          tender_method: 'manual',
          amount: roundedTotal,
          currency: 'KES',
          external_ref: manualRef.trim(),
          tenant_slug: tenantSlug,
          created_at: new Date().toISOString(),
          synced: false,
        });
        setStep('offline_queued');
        onPaymentConfirmed();
      } catch {
        setErrorMsg('Failed to save offline payment. Please try again.');
        setStep('failed');
      }
      return;
    }

    createIntent.mutate(
      { orderId, tenderMethod: 'manual', amount: roundedTotal, externalRef: manualRef.trim() },
      {
        onSuccess: () => { setStep('confirmed'); onPaymentConfirmed(); },
        onError: (err: any) => {
          setErrorMsg(err?.message ?? 'Could not verify M-Pesa code. Please check and try again.');
          setStep('failed');
        },
      }
    );
  }, [manualRef, roundedTotal, orderId, tenderId, tenantSlug, isOnline, createIntent, onPaymentConfirmed]);

  const handleDigital = useCallback((method: string) => {
    createIntent.mutate(
      { orderId, tenderMethod: method, amount: roundedTotal },
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
  }, [orderId, roundedTotal, createIntent]);

  const handleRoomCharge = useCallback(() => {
    if (!selectedRoom) return;
    postRoomCharge.mutate(
      { roomId: selectedRoom.id },
      {
        onSuccess: () => { setStep('confirmed'); onPaymentConfirmed(); },
        onError: (err: any) => {
          setErrorMsg(err?.message ?? 'Failed to post charge to room. Please try again.');
          setStep('failed');
        },
      }
    );
  }, [selectedRoom, postRoomCharge, onPaymentConfirmed]);

  const change = (parseFloat(cashTendered) || 0) - activeAmount;

  const filteredRooms = occupiedRooms.filter((r) =>
    !roomSearch || r.room_number.toLowerCase().includes(roomSearch.toLowerCase()) ||
    (r.edges?.guests?.[0]?.guest_name ?? '').toLowerCase().includes(roomSearch.toLowerCase())
  );

  if (!open) return null;

  return (
    <>
      {step === 'treasury' && intentId && (
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
          onPaymentConfirmed={() => { setStep('confirmed'); onPaymentConfirmed(); }}
          onPaymentFailed={(err) => {
            setErrorMsg(typeof err === 'string' ? err : 'Payment was declined or failed.');
            setStep('failed');
          }}
        />
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-card rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">

          {/* ── Purple amount banner ───────────────────────────────────── */}
          <div className="relative bg-gradient-to-br from-violet-600 to-purple-700 px-6 pt-6 pb-5">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <X className="h-4 w-4 text-white" />
            </button>
            <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">
              {step === 'select' || step === 'mpesa_choice' ? 'Settle Bill' :
               step === 'cash' ? 'Cash Payment' :
               step === 'manual' ? 'M-Pesa Manual' :
               step === 'room_select' || step === 'room_confirm' ? 'Room Charge' :
               step === 'confirmed' ? 'Payment Successful' :
               step === 'offline_queued' ? 'Payment Queued' :
               step === 'failed' ? 'Payment Failed' : 'Payment'}
            </p>
            <p className="text-white text-4xl font-extrabold tabular-nums leading-none">
              KES {(step === 'select' && payMode === 'split' ? splitAmount : roundedTotal).toLocaleString()}
            </p>
            {step === 'select' && payMode === 'split' && (
              <p className="text-white/70 text-xs mt-0.5">per person · KES {roundedTotal.toLocaleString()} total</p>
            )}
            <p className="text-white/60 text-xs mt-1">{orderNumber}</p>
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ── Method selection ──────────────────────────────────────── */}
            {step === 'select' && (
              <div className="p-5 space-y-4">
                {/* Pay mode tabs */}
                <div className="flex gap-1 bg-accent/30 rounded-xl p-1">
                  {(['full', 'split'] as PayMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setPayMode(mode)}
                      className={cn(
                        'flex-1 py-2 rounded-lg text-xs font-bold transition-all',
                        payMode === mode ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {mode === 'full' ? 'Full' : 'Split Equal'}
                    </button>
                  ))}
                </div>

                {/* Split guest counter */}
                {payMode === 'split' && (
                  <div className="flex items-center justify-between bg-accent/20 rounded-xl px-5 py-3">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Number of guests</p>
                      <p className="text-sm font-bold">KES {splitAmount.toLocaleString()} each</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSplitCount(Math.max(2, splitCount - 1))}
                        className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center font-bold text-lg tabular-nums">{splitCount}</span>
                      <button
                        onClick={() => setSplitCount(Math.min(20, splitCount + 1))}
                        className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Payment method tiles */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Cash */}
                  <PayTile
                    icon={<Banknote className="h-7 w-7" />}
                    color="text-emerald-600"
                    bg="bg-emerald-500/10"
                    label="Cash"
                    sub={isOnline ? 'Accept cash' : 'Offline mode'}
                    disabled={false}
                    loading={false}
                    onClick={() => { setCashTendered(String(activeAmount)); setStep('cash'); }}
                  />

                  {/* M-Pesa */}
                  {gateways?.mpesa && (
                    <PayTile
                      icon={<Smartphone className="h-7 w-7" />}
                      color="text-green-600"
                      bg="bg-green-500/10"
                      label="M-Pesa"
                      sub={isOnline ? 'STK or code' : 'Enter code'}
                      disabled={false}
                      loading={createIntent.isPending}
                      onClick={() => isOnline ? setStep('mpesa_choice') : setStep('manual')}
                    />
                  )}

                  {/* Card */}
                  {gateways?.paystack && (
                    <PayTile
                      icon={<CreditCard className="h-7 w-7" />}
                      color="text-blue-600"
                      bg="bg-blue-500/10"
                      label="Card"
                      sub={isOnline ? 'Debit / credit' : 'Requires internet'}
                      disabled={!isOnline}
                      loading={createIntent.isPending}
                      offlineBadge={!isOnline}
                      onClick={() => handleDigital('card')}
                    />
                  )}

                  {/* Room Charge */}
                  {isHospitality && (
                    <PayTile
                      icon={<Building2 className="h-7 w-7" />}
                      color="text-indigo-600"
                      bg="bg-indigo-500/10"
                      label="Room"
                      sub={isOnline ? 'Charge to room' : 'Requires internet'}
                      disabled={!isOnline}
                      loading={false}
                      offlineBadge={!isOnline}
                      onClick={() => setStep('room_select')}
                    />
                  )}
                </div>

                {!isOnline && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-400/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-400 font-medium">
                    <WifiOff className="h-4 w-4 shrink-0" />
                    Offline — cash &amp; manual M-Pesa only. Digital methods available when reconnected.
                  </div>
                )}
              </div>
            )}

            {/* ── M-Pesa sub-choice ─────────────────────────────────────── */}
            {step === 'mpesa_choice' && (
              <div className="p-5 space-y-3">
                <button
                  onClick={() => handleDigital('mpesa')}
                  disabled={createIntent.isPending}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-green-500/40 bg-green-500/5 hover:bg-green-500/10 transition-all disabled:opacity-50"
                >
                  <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                    {createIntent.isPending ? <Loader2 className="h-5 w-5 animate-spin text-green-600" /> : <Smartphone className="h-5 w-5 text-green-600" />}
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">STK Push</p>
                    <p className="text-xs text-muted-foreground">Prompt sent to customer phone</p>
                  </div>
                </button>
                <button
                  onClick={() => setStep('manual')}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border hover:border-yellow-500/40 hover:bg-yellow-500/5 transition-all"
                >
                  <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center shrink-0">
                    <Hash className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">Enter Code Manually</p>
                    <p className="text-xs text-muted-foreground">Paybill or till number reference</p>
                  </div>
                </button>
                <button onClick={() => setStep('select')} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  ← Back
                </button>
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
                  {[activeAmount, Math.ceil(activeAmount / 100) * 100, Math.ceil(activeAmount / 500) * 500]
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
                  disabled={parseFloat(cashTendered) < activeAmount || createIntent.isPending}
                  className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-primary/90 transition-colors"
                >
                  {createIntent.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                  {isOnline ? 'Confirm Cash' : 'Save & Sync Later'}
                </button>
                <button onClick={() => setStep('select')} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  ← Back
                </button>
              </div>
            )}

            {/* ── Manual M-Pesa ─────────────────────────────────────────── */}
            {step === 'manual' && (
              <div className="p-5 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter the M-Pesa transaction code from the customer&apos;s SMS after paying via paybill or till number.
                </p>
                {!isOnline && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400 font-medium">
                    <WifiOff className="h-4 w-4 shrink-0" />
                    Offline — code verified when connection is restored.
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
                  {createIntent.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                  {isOnline ? 'Confirm M-Pesa' : 'Record & Verify Later'}
                </button>
                <button onClick={() => setStep('select')} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  ← Back
                </button>
              </div>
            )}

            {/* ── Room select ───────────────────────────────────────────── */}
            {step === 'room_select' && (
              <div className="p-5 space-y-3">
                <p className="text-sm text-muted-foreground">Select the occupied room to post this bill to:</p>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search room or guest name…"
                    value={roomSearch}
                    onChange={(e) => setRoomSearch(e.target.value)}
                    className="w-full bg-accent/30 border-none rounded-xl py-2 px-4 text-sm focus:ring-1 focus:ring-primary transition-all"
                    autoFocus
                  />
                </div>
                {roomsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
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
                            <p className="text-xs text-muted-foreground truncate">{guest?.guest_name ?? room.room_type}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs bg-emerald-500/10 text-emerald-600 font-semibold px-2 py-0.5 rounded-full">Occupied</span>
                          </div>
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
                  {postRoomCharge.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Building2 className="h-5 w-5" />}
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
                <p className="text-2xl font-bold text-foreground mt-2 tabular-nums">KES {roundedTotal.toLocaleString()}</p>
                <button onClick={onClose} className="mt-6 px-8 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors">
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
                <button onClick={onClose} className="mt-6 px-8 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors">
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
    </>
  );
}

function PayTile({
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
      className={cn(
        'flex flex-col items-center justify-center gap-2 py-5 rounded-2xl border-2 transition-all active:scale-95',
        disabled || loading
          ? 'border-border opacity-40 cursor-not-allowed'
          : 'border-border hover:border-primary/40 hover:bg-accent/30'
      )}
    >
      <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center', bg, color)}>
        {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : icon}
      </div>
      <div className="text-center">
        <p className="font-bold text-sm">{label}</p>
        <p className="text-[10px] text-muted-foreground">{offlineBadge ? 'Unavailable offline' : sub}</p>
      </div>
    </button>
  );
}
