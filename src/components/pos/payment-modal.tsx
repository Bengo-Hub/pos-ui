'use client';

import { TreasuryPaymentModal } from '@bengo-hub/shared-ui-lib';
import { Button } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Smartphone,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useCreatePaymentIntent } from '@/hooks/usePOS';

interface POSPaymentModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  total: number;
  tenantSlug: string;
  onPaymentConfirmed: () => void;
}

type ModalStep = 'select' | 'cash' | 'treasury' | 'confirmed' | 'failed';

export function POSPaymentModal({
  open,
  onClose,
  orderId,
  orderNumber,
  total,
  tenantSlug,
  onPaymentConfirmed,
}: POSPaymentModalProps) {
  const [step, setStep] = useState<ModalStep>('select');
  const [cashTendered, setCashTendered] = useState('');
  const [intentId, setIntentId] = useState('');
  const [initiateUrl, setInitiateUrl] = useState('');

  const createIntent = useCreatePaymentIntent();

  useEffect(() => {
    if (open) {
      setStep('select');
      setCashTendered('');
      setIntentId('');
      setInitiateUrl('');
    }
  }, [open]);

  const handleCashConfirm = useCallback(() => {
    const tendered = parseFloat(cashTendered) || total;
    if (tendered < total) return;

    createIntent.mutate(
      { orderId, tenderMethod: 'cash', amount: total },
      {
        onSuccess: () => {
          setStep('confirmed');
          onPaymentConfirmed();
        },
        onError: () => setStep('failed'),
      }
    );
  }, [cashTendered, total, orderId, createIntent, onPaymentConfirmed]);

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
          {/* Payment method selection */}
          {step === 'select' && (
            <div className="p-5 space-y-3">
              {/* Cash */}
              <button
                onClick={() => { setCashTendered(String(total)); setStep('cash'); }}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border hover:border-primary/30 transition-all min-h-15"
              >
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Banknote className="h-5 w-5 text-green-600" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm">Cash</p>
                  <p className="text-xs text-muted-foreground">Accept cash payment</p>
                </div>
              </button>

              {/* M-Pesa */}
              <button
                onClick={() => handleDigital('mpesa')}
                disabled={createIntent.isPending}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border hover:border-primary/30 transition-all min-h-15 disabled:opacity-50"
              >
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Smartphone className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm">M-Pesa / Mobile Money</p>
                  <p className="text-xs text-muted-foreground">STK Push or till payment</p>
                </div>
              </button>

              {/* Card */}
              <button
                onClick={() => handleDigital('card')}
                disabled={createIntent.isPending}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border hover:border-primary/30 transition-all min-h-15 disabled:opacity-50"
              >
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm">Card Payment</p>
                  <p className="text-xs text-muted-foreground">Debit or credit card</p>
                </div>
              </button>

              {/* Other (wallet, airtel, etc.) */}
              <button
                onClick={() => handleDigital('pending')}
                disabled={createIntent.isPending}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border hover:border-primary/30 transition-all min-h-15 disabled:opacity-50"
              >
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-purple-600" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm">Other Payment Methods</p>
                  <p className="text-xs text-muted-foreground">Wallet, Airtel Money, and more</p>
                </div>
              </button>

              {createIntent.isPending && (
                <div className="flex items-center justify-center py-2 gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating payment intent...
                </div>
              )}
            </div>
          )}

          {/* Cash tendered UI */}
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
                Confirm Cash Payment
              </Button>
              <Button variant="outline" onClick={() => setStep('select')} className="w-full">
                Back
              </Button>
            </div>
          )}

          {/* Treasury payment modal for digital payments */}
          {step === 'treasury' && intentId && (
            <div className="p-2">
              <TreasuryPaymentModal
                open={step === 'treasury'}
                onOpenChange={(isOpen) => { if (!isOpen) setStep('select'); }}
                paymentIntentId={intentId}
                tenantSlug={tenantSlug}
                initiateUrl={initiateUrl}
                amount={total}
                onPaymentConfirmed={() => {
                  setStep('confirmed');
                  onPaymentConfirmed();
                }}
                onPaymentFailed={() => setStep('failed')}
              />
            </div>
          )}

          {/* Confirmed */}
          {step === 'confirmed' && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
              <h3 className="text-lg font-bold mb-2">Payment Successful</h3>
              <p className="text-sm text-muted-foreground">Order {orderNumber} has been paid.</p>
              <Button className="mt-6" onClick={onClose}>Done</Button>
            </div>
          )}

          {/* Failed */}
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
  );
}
