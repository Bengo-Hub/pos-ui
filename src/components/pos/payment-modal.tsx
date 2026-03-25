'use client';

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
import { useCallback, useEffect, useRef, useState } from 'react';

interface PaymentResult {
  intentId: string;
  amount: number;
  reference?: string;
  channel?: string;
}

interface POSPaymentModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  total: number;
  tenantSlug: string;
  /** If null, renders quick cash/manual payment without treasury iframe */
  paymentIntentId: string | null;
  onPaymentConfirmed: (result: PaymentResult) => void;
  onCashPayment?: (amount: number) => void;
}

type PaymentStep = 'select' | 'iframe' | 'processing' | 'confirmed' | 'failed';
type QuickMethod = 'cash' | 'card' | 'mpesa' | 'treasury';

const TREASURY_UI_URL = process.env.NEXT_PUBLIC_TREASURY_UI_URL || 'https://books.codevertexitsolutions.com';

export function POSPaymentModal({
  open,
  onClose,
  orderId,
  orderNumber,
  total,
  tenantSlug,
  paymentIntentId,
  onPaymentConfirmed,
  onCashPayment,
}: POSPaymentModalProps) {
  const [step, setStep] = useState<PaymentStep>('select');
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [cashTendered, setCashTendered] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setStep('select');
      setIframeLoaded(false);
      setCashTendered('');
    }
  }, [open]);

  // Listen for treasury postMessage events
  useEffect(() => {
    if (!open || step !== 'iframe') return;

    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data?.type?.startsWith('treasury:')) return;

      if (data.type === 'treasury:payment_confirmed') {
        setStep('confirmed');
        onPaymentConfirmed({
          intentId: data.intentId,
          amount: data.amount,
          reference: data.reference,
          channel: data.channel,
        });
      } else if (data.type === 'treasury:payment_failed') {
        setStep('failed');
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [open, step, onPaymentConfirmed]);

  const handleCashPayment = useCallback(() => {
    const amount = parseFloat(cashTendered) || total;
    onCashPayment?.(amount);
    onPaymentConfirmed({ intentId: '', amount, channel: 'cash' });
    setStep('confirmed');
  }, [cashTendered, total, onCashPayment, onPaymentConfirmed]);

  const handleMethodSelect = useCallback((method: QuickMethod) => {
    if (method === 'cash') {
      // Show cash tendered input, no iframe needed
      setCashTendered(String(total));
    } else {
      // Open treasury iframe for digital payments
      setStep('iframe');
    }
  }, [total]);

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
          <button onClick={onClose} className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Payment method selection */}
          {step === 'select' && (
            <div className="p-5 space-y-3">
              {/* Cash option with tendered amount */}
              <div className="space-y-3">
                <button
                  onClick={() => handleMethodSelect('cash')}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border hover:border-primary/30 transition-all min-h-[60px]"
                >
                  <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <Banknote className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">Cash</p>
                    <p className="text-xs text-muted-foreground">Accept cash payment</p>
                  </div>
                </button>

                {cashTendered !== '' && (
                  <div className="ml-14 space-y-3 animate-in slide-in-from-top-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Cash Tendered</label>
                      <input
                        type="number"
                        value={cashTendered}
                        onChange={(e) => setCashTendered(e.target.value)}
                        className="w-full bg-background border border-border rounded-xl py-3 px-4 text-lg font-bold focus:ring-1 focus:ring-primary"
                        autoFocus
                      />
                    </div>
                    {change >= 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Change</span>
                        <span className="font-bold text-green-600">KES {change.toLocaleString()}</span>
                      </div>
                    )}
                    <Button
                      onClick={handleCashPayment}
                      disabled={parseFloat(cashTendered) < total}
                      className={cn('w-full min-h-[48px] font-bold', parseFloat(cashTendered) < total && 'opacity-50')}
                    >
                      <CheckCircle2 className="h-5 w-5 mr-2" />
                      Confirm Cash Payment
                    </Button>
                  </div>
                )}
              </div>

              {/* Digital payment methods → Treasury iframe */}
              <button
                onClick={() => handleMethodSelect('mpesa')}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border hover:border-primary/30 transition-all min-h-[60px]"
              >
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Smartphone className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm">M-Pesa / Mobile Money</p>
                  <p className="text-xs text-muted-foreground">STK Push or till payment</p>
                </div>
              </button>

              <button
                onClick={() => handleMethodSelect('card')}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border hover:border-primary/30 transition-all min-h-[60px]"
              >
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm">Card Payment</p>
                  <p className="text-xs text-muted-foreground">Debit or credit card</p>
                </div>
              </button>

              <button
                onClick={() => handleMethodSelect('treasury')}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border hover:border-primary/30 transition-all min-h-[60px]"
              >
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-purple-600" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm">Other Payment Methods</p>
                  <p className="text-xs text-muted-foreground">Wallet, Airtel Money, PayPal, etc.</p>
                </div>
              </button>
            </div>
          )}

          {/* Treasury iframe for digital payments */}
          {step === 'iframe' && paymentIntentId && (
            <div className="relative">
              {!iframeLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-card z-10">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading payment page...</p>
                  </div>
                </div>
              )}
              <iframe
                ref={iframeRef}
                src={`${TREASURY_UI_URL}/pay?intent_id=${paymentIntentId}&tenant=${tenantSlug}&embed=true`}
                className="w-full h-[500px] border-0"
                title="Payment"
                onLoad={() => setIframeLoaded(true)}
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
              />
            </div>
          )}

          {/* Confirmed state */}
          {step === 'confirmed' && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
              <h3 className="text-lg font-bold mb-2">Payment Successful</h3>
              <p className="text-sm text-muted-foreground">Order {orderNumber} has been paid.</p>
              <Button className="mt-6" onClick={onClose}>
                Done
              </Button>
            </div>
          )}

          {/* Failed state */}
          {step === 'failed' && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <XCircle className="h-16 w-16 text-destructive mb-4" />
              <h3 className="text-lg font-bold mb-2">Payment Failed</h3>
              <p className="text-sm text-muted-foreground">Please try again or use a different method.</p>
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
