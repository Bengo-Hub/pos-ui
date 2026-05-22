'use client';

import { useState } from 'react';
import { Users, SplitSquareHorizontal, CreditCard, Minus, Plus, X } from 'lucide-react';
import { POSPaymentModal } from './payment-modal';

type SplitMode = 'full' | 'equal' | 'custom';

interface CustomSplit {
  amount: string;
  paid: boolean;
}

interface SplitPaymentModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  total: number;
  tenantSlug: string;
  tenderId?: string;
  onPaymentConfirmed: () => void;
}

export function SplitPaymentModal({
  open,
  onClose,
  orderId,
  orderNumber,
  total,
  tenantSlug,
  tenderId,
  onPaymentConfirmed,
}: SplitPaymentModalProps) {
  const [mode, setMode] = useState<SplitMode>('full');
  const [peopleCount, setPeopleCount] = useState(2);
  const [currentPayer, setCurrentPayer] = useState<number | null>(null);
  const [paidCount, setPaidCount] = useState(0);
  const [customSplits, setCustomSplits] = useState<CustomSplit[]>([{ amount: '', paid: false }]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n);

  const equalShare = Math.ceil((total / peopleCount) * 100) / 100;

  function handleEqualPayerDone() {
    const next = paidCount + 1;
    setCurrentPayer(null);
    if (next >= peopleCount) {
      onPaymentConfirmed();
    } else {
      setPaidCount(next);
    }
  }

  function customRemaining() {
    return customSplits.reduce((sum, s) => sum + (s.paid ? 0 : parseFloat(s.amount) || 0), 0);
  }

  function handleCustomPayerDone(idx: number) {
    const updated = [...customSplits];
    updated[idx] = { ...updated[idx], paid: true };
    setCustomSplits(updated);
    setCurrentPayer(null);
    if (updated.every((s) => s.paid)) {
      onPaymentConfirmed();
    }
  }

  if (!open) return null;

  // Sub-modal for a specific payer
  if (currentPayer !== null) {
    const payAmount = mode === 'equal' ? equalShare : parseFloat(customSplits[currentPayer].amount) || 0;
    const label = mode === 'equal' ? `Person ${currentPayer + paidCount + 1} of ${peopleCount}` : `Split ${currentPayer + 1}`;

    return (
      <POSPaymentModal
        open
        onClose={() => setCurrentPayer(null)}
        orderId={orderId}
        orderNumber={`${orderNumber} — ${label}`}
        total={payAmount}
        tenantSlug={tenantSlug}
        tenderId={tenderId}
        onPaymentConfirmed={mode === 'equal' ? handleEqualPayerDone : () => handleCustomPayerDone(currentPayer)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <CreditCard className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <h2 className="font-bold text-base">Payment</h2>
            <p className="text-xs text-muted-foreground">Order #{orderNumber} · {fmt(total)}</p>
          </div>
          <button type="button" onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-accent transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 px-5 pt-4">
          {([
            { key: 'full', label: 'Full Payment', icon: CreditCard },
            { key: 'equal', label: 'Split Equally', icon: Users },
            { key: 'custom', label: 'Custom Split', icon: SplitSquareHorizontal },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl text-xs font-semibold border transition-colors ${
                mode === key
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* Full payment */}
          {mode === 'full' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Process the full amount in one payment.</p>
              <button
                type="button"
                onClick={() => setCurrentPayer(0)}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Pay {fmt(total)}
              </button>
            </div>
          )}

          {/* Split equally */}
          {mode === 'equal' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Number of people</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPeopleCount((p) => Math.max(2, p - 1))}
                    className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold tabular-nums">{peopleCount}</span>
                  <button
                    type="button"
                    onClick={() => setPeopleCount((p) => Math.min(10, p + 1))}
                    className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Each person pays</p>
                <p className="text-xl font-bold text-foreground">{fmt(equalShare)}</p>
              </div>
              <div className="space-y-2">
                {Array.from({ length: peopleCount }, (_, i) => {
                  const isPaid = i < paidCount;
                  const isNext = i === paidCount;
                  return (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-xl border ${isPaid ? 'border-green-200 bg-green-50 dark:bg-green-900/10' : 'border-border'}`}>
                      <span className="text-sm font-medium text-foreground">Person {i + 1}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{fmt(equalShare)}</span>
                        {isPaid ? (
                          <span className="text-xs text-green-600 font-bold">Paid</span>
                        ) : isNext ? (
                          <button
                            type="button"
                            onClick={() => setCurrentPayer(i - paidCount)}
                            className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                          >
                            Pay
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Waiting</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom split */}
          {mode === 'custom' && (
            <div className="space-y-3">
              {customSplits.map((split, i) => (
                <div key={i} className={`flex items-center gap-2 p-2 rounded-xl border ${split.paid ? 'border-green-200 bg-green-50 dark:bg-green-900/10 opacity-60' : 'border-border'}`}>
                  <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}</span>
                  <input
                    type="number"
                    placeholder="Amount"
                    value={split.amount}
                    onChange={(e) => {
                      const updated = [...customSplits];
                      updated[i] = { ...updated[i], amount: e.target.value };
                      setCustomSplits(updated);
                    }}
                    disabled={split.paid}
                    className="flex-1 h-8 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
                  />
                  {split.paid ? (
                    <span className="text-xs text-green-600 font-bold whitespace-nowrap">Paid</span>
                  ) : (
                    <button
                      type="button"
                      disabled={!split.amount || parseFloat(split.amount) <= 0}
                      onClick={() => setCurrentPayer(i)}
                      className="px-2 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors whitespace-nowrap"
                    >
                      Pay
                    </button>
                  )}
                  {customSplits.length > 1 && !split.paid && (
                    <button
                      type="button"
                      onClick={() => setCustomSplits(customSplits.filter((_, j) => j !== i))}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setCustomSplits([...customSplits, { amount: '', paid: false }])}
                className="w-full py-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:bg-accent transition-colors"
              >
                + Add payer
              </button>
              <div className="flex justify-between text-xs text-muted-foreground px-1">
                <span>Entered: {fmt(customSplits.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0))}</span>
                <span className={customRemaining() > total ? 'text-destructive' : ''}>
                  Total: {fmt(total)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
