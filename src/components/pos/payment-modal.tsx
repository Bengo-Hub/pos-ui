'use client';

import { TreasuryPaymentModal } from '@bengo-hub/shared-ui-lib';
import { Button } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import {
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  DoorOpen,
  Hash,
  Loader2,
  Smartphone,
  Wallet,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useCreatePaymentIntent } from '@/hooks/usePOS';
import { useOnline } from '@/hooks/use-online';
import { savePendingPayment } from '@/lib/db/pos-db';
import { usePOSGateways } from '@/hooks/use-pos-gateways';

export interface POSPaymentModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  total: number;
  tenantSlug: string;
  tenderId?: string;
  /** Pre-fill customer email in the treasury payment page */
  customerEmail?: string;
  /** Whether this is a room service / hospitality order — shows Room Charge option */
  isHospitality?: boolean;
  /** Comma-separated list of allowed payment method keys to pass to TreasuryPaymentModal */
  allowedMethods?: string;
  onPaymentConfirmed: () => void;
}

type ModalStep = 'select' | 'cash' | 'manual' | 'treasury' | 'confirmed' | 'offline_queued' | 'failed';

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
  // Always collect whole-number amounts — round up any fractional totals (e.g. 1252.8 → 1253)
  const roundedTotal = Math.ceil(total);

  const [step, setStep] = useState<ModalStep>('select');
  const [cashTendered, setCashTendered] = useState('');
  const [manualRef, setManualRef] = useState('');
  const [intentId, setIntentId] = useState('');
  const [initiateUrl, setInitiateUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const createIntent = useCreatePaymentIntent();
  const isOnline = useOnline();
  const { data: gateways } = usePOSGateways();

  useEffect(() => {
    if (open) {
      setStep('select');
      setCashTendered('');
      setManualRef('');
      setIntentId('');
      setInitiateUrl('');
      setErrorMsg('');
    }
  }, [open]);

  // ── Cash confirm ─────────────────────────────────────────────────────────────
  const handleCashConfirm = useCallback(async () => {
    const tendered = parseFloat(cashTendered) || roundedTotal;
    if (tendered < roundedTotal) return;

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
  }, [cashTendered, total, orderId, tenderId, tenantSlug, isOnline, createIntent, onPaymentConfirmed]);

  // ── Manual M-Pesa confirm ─────────────────────────────────────────────────────
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
  }, [manualRef, orderId, tenderId, tenantSlug, total, isOnline, createIntent, onPaymentConfirmed]);

  // ── Digital (STK push / card / wallet / room_charge) ─────────────────────────
  const handleDigital = useCallback(
    (method: string) => {
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
    },
    [orderId, total, createIntent]
  );

  const change = (parseFloat(cashTendered) || 0) - roundedTotal;

  if (!open) return null;

  return (
    <>
      {/* ── Treasury payment modal — renders as its own full-screen overlay ── */}
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

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
          {/* Header */}
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base text-muted-foreground">
                {step === 'select' ? 'Select Payment Method' :
                 step === 'cash' ? 'Cash Payment' :
                 step === 'manual' ? 'M-Pesa Manual' :
                 step === 'confirmed' ? 'Payment Successful' :
                 step === 'offline_queued' ? 'Payment Queued' :
                 step === 'failed' ? 'Payment Failed' : 'Payment'}
              </h3>
              <p className="text-2xl font-bold text-foreground mt-0.5 tabular-nums">
                KES {roundedTotal.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">{orderNumber}</p>
            </div>
            <button
              onClick={onClose}
              className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-accent transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ── Method selection ─────────────────────────────────────────── */}
            {step === 'select' && (
              <div className="p-5 space-y-2.5">
                {/* Cash — always available */}
                <MethodButton
                  icon={<Banknote className="h-5 w-5 text-green-600" />}
                  iconBg="bg-green-500/10"
                  label="Cash"
                  desc={isOnline ? 'Accept cash payment' : 'Offline — will sync automatically'}
                  loading={false}
                  disabled={false}
                  onClick={() => { setCashTendered(String(roundedTotal)); setStep('cash'); }}
                />

                {/* M-Pesa STK push — online only */}
                {gateways?.mpesa && (
                  <MethodButton
                    icon={<Smartphone className="h-5 w-5 text-emerald-600" />}
                    iconBg="bg-emerald-500/10"
                    label="M-Pesa STK Push"
                    desc={isOnline ? 'Prompt sent to customer phone' : 'Requires internet connection'}
                    loading={createIntent.isPending}
                    disabled={!isOnline}
                    onClick={() => handleDigital('mpesa')}
                    offlineBadge={!isOnline}
                  />
                )}

                {/* Manual M-Pesa reference — online and offline */}
                {gateways?.mpesa && (
                  <MethodButton
                    icon={<Hash className="h-5 w-5 text-yellow-600" />}
                    iconBg="bg-yellow-500/10"
                    label="M-Pesa (Manual / Paybill)"
                    desc={isOnline ? 'Enter M-Pesa transaction code' : 'Record code — syncs when back online'}
                    loading={false}
                    disabled={false}
                    onClick={() => setStep('manual')}
                  />
                )}

                {/* Card — online only */}
                {gateways?.paystack && (
                  <MethodButton
                    icon={<CreditCard className="h-5 w-5 text-blue-600" />}
                    iconBg="bg-blue-500/10"
                    label="Card Payment"
                    desc={isOnline ? 'Debit or credit card via Paystack' : 'Requires internet connection'}
                    loading={createIntent.isPending}
                    disabled={!isOnline}
                    onClick={() => handleDigital('card')}
                    offlineBadge={!isOnline}
                  />
                )}

                {/* Wallet / Other — online only */}
                {gateways?.wallet && (
                  <MethodButton
                    icon={<Wallet className="h-5 w-5 text-purple-600" />}
                    iconBg="bg-purple-500/10"
                    label="Wallet / Other Methods"
                    desc={isOnline ? 'Airtel Money, wallet, and more' : 'Requires internet connection'}
                    loading={createIntent.isPending}
                    disabled={!isOnline}
                    onClick={() => handleDigital('wallet')}
                    offlineBadge={!isOnline}
                  />
                )}

                {/* Room Charge — hospitality only, online only */}
                {isHospitality && (
                  <MethodButton
                    icon={<DoorOpen className="h-5 w-5 text-indigo-600" />}
                    iconBg="bg-indigo-500/10"
                    label="Room Charge"
                    desc={isOnline ? 'Charge to guest room account' : 'Requires internet connection'}
                    loading={createIntent.isPending}
                    disabled={!isOnline}
                    onClick={() => handleDigital('room_charge')}
                    offlineBadge={!isOnline}
                  />
                )}

                {!isOnline && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-400/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-400 font-medium mt-1">
                    <WifiOff className="h-4 w-4 shrink-0" />
                    Offline — cash &amp; manual M-Pesa available. Digital methods sync automatically when reconnected.
                  </div>
                )}
              </div>
            )}

            {/* ── Cash tendered ────────────────────────────────────────────── */}
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

                {/* Quick amounts */}
                <div className="grid grid-cols-3 gap-2">
                  {[roundedTotal, Math.ceil(roundedTotal / 100) * 100, Math.ceil(roundedTotal / 500) * 500].filter((v, i, a) => a.indexOf(v) === i).map((amt) => (
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
                    Offline — payment saved locally and syncs when connection is restored.
                  </div>
                )}
                <Button
                  onClick={handleCashConfirm}
                  disabled={parseFloat(cashTendered) < roundedTotal || createIntent.isPending}
                  className="w-full min-h-12 font-bold"
                >
                  {createIntent.isPending
                    ? <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    : <CheckCircle2 className="h-5 w-5 mr-2" />}
                  {isOnline ? 'Confirm Cash Payment' : 'Record & Sync Later'}
                </Button>
                <Button variant="outline" onClick={() => setStep('select')} className="w-full">
                  Back
                </Button>
              </div>
            )}

            {/* ── Manual M-Pesa reference ──────────────────────────────────── */}
            {step === 'manual' && (
              <div className="p-5 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter the M-Pesa transaction code from the customer&apos;s SMS after paying via paybill or till number.
                </p>
                {!isOnline && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400 font-medium">
                    <WifiOff className="h-4 w-4 shrink-0" />
                    Offline — code will be verified against M-Pesa records when connection is restored.
                  </div>
                )}
                <label className="block">
                  <span className="text-sm font-medium text-foreground">M-Pesa Transaction Code</span>
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
                <Button
                  onClick={handleManualConfirm}
                  disabled={!manualRef.trim() || createIntent.isPending}
                  className="w-full min-h-12 font-bold"
                >
                  {createIntent.isPending
                    ? <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    : <CheckCircle2 className="h-5 w-5 mr-2" />}
                  {isOnline ? 'Confirm Manual Payment' : 'Record & Verify Later'}
                </Button>
                <Button variant="outline" onClick={() => setStep('select')} className="w-full">
                  Back
                </Button>
              </div>
            )}

            {/* ── Confirmed ────────────────────────────────────────────────── */}
            {step === 'confirmed' && (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                </div>
                <h3 className="text-xl font-bold mb-1">Payment Successful</h3>
                <p className="text-sm text-muted-foreground">Order {orderNumber} has been paid in full.</p>
                <p className="text-2xl font-bold text-foreground mt-2 tabular-nums">KES {roundedTotal.toLocaleString()}</p>
                <Button className="mt-6 min-w-32" onClick={onClose}>Done</Button>
              </div>
            )}

            {/* ── Offline queued ───────────────────────────────────────────── */}
            {step === 'offline_queued' && (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="h-20 w-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
                  <Clock className="h-10 w-10 text-amber-500" />
                </div>
                <h3 className="text-xl font-bold mb-1">Payment Queued</h3>
                <p className="text-sm text-muted-foreground">
                  You are offline. The payment for {orderNumber} has been saved locally and will
                  sync to treasury automatically when your connection is restored.
                </p>
                <Button className="mt-6 min-w-32" onClick={onClose}>Done</Button>
              </div>
            )}

            {/* ── Failed ──────────────────────────────────────────────────── */}
            {step === 'failed' && (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                  <XCircle className="h-10 w-10 text-destructive" />
                </div>
                <h3 className="text-xl font-bold mb-1">Payment Failed</h3>
                <p className="text-sm text-muted-foreground">
                  {errorMsg || 'Something went wrong. Please try again or choose a different method.'}
                </p>
                <Button className="mt-6" variant="outline" onClick={() => setStep('select')}>
                  Try Again
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── MethodButton ─────────────────────────────────────────────────────────────

function MethodButton({
  icon,
  iconBg,
  label,
  desc,
  loading,
  disabled,
  offlineBadge,
  onClick,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  desc: string;
  loading: boolean;
  disabled: boolean;
  offlineBadge?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 transition-all text-left',
        disabled || loading
          ? 'border-border opacity-50 cursor-not-allowed'
          : 'border-border hover:border-primary/50 hover:bg-accent/30 active:scale-[0.99]'
      )}
    >
      <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      {offlineBadge && (
        <WifiOff className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
    </button>
  );
}
