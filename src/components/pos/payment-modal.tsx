'use client';

import { TreasuryPaymentModal } from '@bengo-hub/shared-ui-lib';
import { Button } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import {
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
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

interface POSPaymentModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  total: number;
  tenantSlug: string;
  tenderId?: string;
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
  onPaymentConfirmed,
}: POSPaymentModalProps) {
  const [step, setStep] = useState<ModalStep>('select');
  const [cashTendered, setCashTendered] = useState('');
  const [manualRef, setManualRef] = useState('');
  const [intentId, setIntentId] = useState('');
  const [initiateUrl, setInitiateUrl] = useState('');

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
    }
  }, [open]);

  // ── Cash confirm ─────────────────────────────────────────────────────────────
  const handleCashConfirm = useCallback(async () => {
    const tendered = parseFloat(cashTendered) || total;
    if (tendered < total) return;

    if (!isOnline) {
      // Offline: save locally and show pending-sync state
      try {
        await savePendingPayment({
          server_order_id: orderId,
          tender_id: tenderId,
          tender_method: 'cash',
          amount: total,
          currency: 'KES',
          tenant_slug: tenantSlug,
          created_at: new Date().toISOString(),
          synced: false,
        });
        setStep('offline_queued');
        onPaymentConfirmed();
      } catch {
        setStep('failed');
      }
      return;
    }

    createIntent.mutate(
      { orderId, tenderMethod: 'cash', amount: total },
      {
        onSuccess: () => { setStep('confirmed'); onPaymentConfirmed(); },
        onError: () => setStep('failed'),
      }
    );
  }, [cashTendered, total, orderId, tenderId, tenantSlug, isOnline, createIntent, onPaymentConfirmed]);

  // ── Manual M-Pesa confirm ─────────────────────────────────────────────────────
  const handleManualConfirm = useCallback(async () => {
    if (!manualRef.trim()) return;

    if (!isOnline) {
      // Offline: save locally with pending_verification status — sync worker validates later
      try {
        await savePendingPayment({
          server_order_id: orderId,
          tender_id: tenderId,
          tender_method: 'manual',
          amount: total,
          currency: 'KES',
          external_ref: manualRef.trim(),
          tenant_slug: tenantSlug,
          created_at: new Date().toISOString(),
          synced: false,
        });
        setStep('offline_queued');
        onPaymentConfirmed();
      } catch {
        setStep('failed');
      }
      return;
    }

    createIntent.mutate(
      { orderId, tenderMethod: 'manual', amount: total, externalRef: manualRef.trim() },
      {
        onSuccess: () => { setStep('confirmed'); onPaymentConfirmed(); },
        onError: () => setStep('failed'),
      }
    );
  }, [manualRef, orderId, tenderId, tenantSlug, total, isOnline, createIntent, onPaymentConfirmed]);

  // ── Digital (STK push / card) ─────────────────────────────────────────────────
  const handleDigital = useCallback(
    (method: string) => {
      createIntent.mutate(
        { orderId, tenderMethod: method, amount: total },
        {
          onSuccess: (data) => {
            setIntentId(data.payment_intent_id);
            setInitiateUrl(data.initiate_url);
            setStep('treasury');
          },
          onError: () => setStep('failed'),
        }
      );
    },
    [orderId, total, createIntent]
  );

  const change = (parseFloat(cashTendered) || 0) - total;

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
          amount={total}
          currency="KES"
          referenceId={orderId}
          referenceType="pos_sale"
          onPaymentConfirmed={() => { setStep('confirmed'); onPaymentConfirmed(); }}
          onPaymentFailed={() => setStep('failed')}
        />
      )}

    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">Payment — {orderNumber}</h3>
            <p className="text-2xl font-bold text-primary mt-1">KES {total.toLocaleString()}</p>
          </div>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── Method selection ───────────────────────────────────────────── */}
          {step === 'select' && (
            <div className="p-5 space-y-3">
              {/* Cash — always available */}
              <button
                onClick={() => { setCashTendered(String(total)); setStep('cash'); }}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border hover:border-primary/30 transition-all min-h-15"
              >
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Banknote className="h-5 w-5 text-green-600" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm">Cash</p>
                  <p className="text-xs text-muted-foreground">
                    {isOnline ? 'Accept cash payment' : 'Offline — will sync automatically'}
                  </p>
                </div>
              </button>

              {/* M-Pesa STK push — online only; shown when mpesa gateway is enabled */}
              {gateways?.mpesa && (
                <button
                  onClick={() => handleDigital('mpesa')}
                  disabled={createIntent.isPending || !isOnline}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border hover:border-primary/30 transition-all min-h-15 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Smartphone className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">M-Pesa STK Push</p>
                    <p className="text-xs text-muted-foreground">
                      {isOnline ? 'Prompt sent to customer phone' : 'Requires internet connection'}
                    </p>
                  </div>
                </button>
              )}

              {/* Manual M-Pesa reference — shown when mpesa is enabled; works online and offline */}
              {gateways?.mpesa && (
                <button
                  onClick={() => setStep('manual')}
                  disabled={createIntent.isPending}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border hover:border-primary/30 transition-all min-h-15 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                    <Hash className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">M-Pesa (Manual / Paybill)</p>
                    <p className="text-xs text-muted-foreground">
                      {isOnline ? 'Enter M-Pesa transaction code' : 'Record code — syncs to treasury when back online'}
                    </p>
                  </div>
                </button>
              )}

              {/* Card — shown when paystack gateway is enabled; online only */}
              {gateways?.paystack && (
                <button
                  onClick={() => handleDigital('card')}
                  disabled={createIntent.isPending || !isOnline}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border hover:border-primary/30 transition-all min-h-15 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">Card Payment</p>
                    <p className="text-xs text-muted-foreground">
                      {isOnline ? 'Debit or credit card' : 'Requires internet connection'}
                    </p>
                  </div>
                </button>
              )}

              {/* Wallet / Airtel Money — shown when wallet gateway is enabled; online only */}
              {gateways?.wallet && (
                <button
                  onClick={() => handleDigital('pending')}
                  disabled={createIntent.isPending || !isOnline}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border hover:border-primary/30 transition-all min-h-15 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Wallet className="h-5 w-5 text-purple-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">Other Payment Methods</p>
                    <p className="text-xs text-muted-foreground">
                      {isOnline ? 'Wallet, Airtel Money, and more' : 'Requires internet connection'}
                    </p>
                  </div>
                </button>
              )}

              {!isOnline && (
                <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400 font-medium">
                  <WifiOff className="h-4 w-4 shrink-0" />
                  Offline — cash &amp; manual M-Pesa available. All payments sync automatically to treasury when reconnected.
                </div>
              )}

              {createIntent.isPending && (
                <div className="flex items-center justify-center py-2 gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating payment intent...
                </div>
              )}
            </div>
          )}

          {/* ── Cash tendered ──────────────────────────────────────────────── */}
          {step === 'cash' && (
            <div className="p-5 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-foreground">Cash Tendered (KES)</span>
                <input
                  type="number"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  className="mt-1 w-full bg-background border border-border rounded-xl py-3 px-4 text-lg font-bold focus:ring-1 focus:ring-primary"
                  autoFocus
                />
              </label>
              {change >= 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Change</span>
                  <span className="font-bold text-green-600">KES {change.toLocaleString()}</span>
                </div>
              )}
              {!isOnline && (
                <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400 font-medium">
                  <WifiOff className="h-4 w-4 shrink-0" />
                  Offline — payment saved locally and will sync when connection is restored.
                </div>
              )}
              <Button
                onClick={handleCashConfirm}
                disabled={parseFloat(cashTendered) < total || createIntent.isPending}
                className={cn('w-full min-h-12 font-bold', parseFloat(cashTendered) < total && 'opacity-50')}
              >
                {createIntent.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                )}
                {isOnline ? 'Confirm Cash Payment' : 'Record & Sync Later'}
              </Button>
              <Button variant="outline" onClick={() => setStep('select')} className="w-full">
                Back
              </Button>
            </div>
          )}

          {/* ── Manual M-Pesa reference ────────────────────────────────────── */}
          {step === 'manual' && (
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter the M-Pesa transaction code from the customer&apos;s SMS confirmation after paying via paybill or till number.
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
                  className="mt-1 w-full bg-background border border-border rounded-xl py-3 px-4 text-lg font-bold tracking-widest uppercase focus:ring-1 focus:ring-primary"
                  autoFocus
                  maxLength={20}
                />
              </label>
              <Button
                onClick={handleManualConfirm}
                disabled={!manualRef.trim() || createIntent.isPending}
                className="w-full min-h-12 font-bold"
              >
                {createIntent.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                )}
                {isOnline ? 'Confirm Manual Payment' : 'Record & Verify Later'}
              </Button>
              <Button variant="outline" onClick={() => setStep('select')} className="w-full">
                Back
              </Button>
            </div>
          )}

          {/* ── Confirmed ─────────────────────────────────────────────────── */}
          {step === 'confirmed' && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
              <h3 className="text-lg font-bold mb-2">Payment Successful</h3>
              <p className="text-sm text-muted-foreground">Order {orderNumber} has been paid.</p>
              <Button className="mt-6" onClick={onClose}>Done</Button>
            </div>
          )}

          {/* ── Offline queued ────────────────────────────────────────────── */}
          {step === 'offline_queued' && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <Clock className="h-16 w-16 text-amber-500 mb-4" />
              <h3 className="text-lg font-bold mb-2">Payment Queued</h3>
              <p className="text-sm text-muted-foreground">
                You are offline. The cash payment for order {orderNumber} has been saved locally and will
                automatically sync to the server when your connection is restored.
              </p>
              <Button className="mt-6" onClick={onClose}>Done</Button>
            </div>
          )}

          {/* ── Failed ────────────────────────────────────────────────────── */}
          {step === 'failed' && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <XCircle className="h-16 w-16 text-destructive mb-4" />
              <h3 className="text-lg font-bold mb-2">Payment Failed</h3>
              <p className="text-sm text-muted-foreground">Please try again or choose a different method.</p>
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
