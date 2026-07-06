'use client';

import { useState } from 'react';
import { Percent, ReceiptText, X } from 'lucide-react';

interface OrderTaxModalProps {
  open: boolean;
  subtotal: number;
  currentAmount: number;
  onApply: (amount: number) => void;
  onClose: () => void;
}

/**
 * OrderTaxModal — manager/admin quick edit for an ORDER-level tax adjustment added on top of
 * the per-line tax (QA req 4, "Edit Order Tax"). Entered as a percentage of the subtotal or a
 * fixed amount. Non-managers trigger a manager step-up at checkout (order.adjustment, enforced
 * + audited server-side).
 */
export function OrderTaxModal({ open, subtotal, currentAmount, onApply, onClose }: OrderTaxModalProps) {
  const [mode, setMode] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState<string>(currentAmount ? String(currentAmount) : '');

  if (!open) return null;

  const numeric = parseFloat(value) || 0;
  const amount = mode === 'percent' ? Math.round(subtotal * numeric) / 100 : numeric;
  const pct = subtotal > 0 ? (amount / subtotal) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-[56] w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2"><ReceiptText className="h-4 w-4 text-primary" /> Edit Order Tax</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex gap-1 bg-accent/10 p-1 rounded-lg">
          <button onClick={() => setMode('percent')}
            className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md ${mode === 'percent' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
            <Percent className="h-3.5 w-3.5" /> Percent
          </button>
          <button onClick={() => setMode('amount')}
            className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md ${mode === 'amount' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
            Amount
          </button>
        </div>

        <input
          type="number" min={0} autoFocus inputMode="decimal"
          value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={mode === 'percent' ? 'e.g. 16 (%)' : 'e.g. 320 (KES)'}
          className="w-full bg-accent/10 border border-border rounded-lg py-2.5 px-3 text-lg font-bold text-center focus:ring-1 focus:ring-primary outline-none"
        />

        <div className="text-xs text-muted-foreground text-center">
          Order tax: <span className="font-bold text-foreground">KES {amount.toLocaleString()}</span> ({pct.toFixed(1)}% of subtotal) — added on top of item tax
        </div>

        <div className="flex gap-2">
          <button onClick={() => onApply(0)} className="flex-1 px-3 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-accent/10">
            Clear
          </button>
          <button onClick={() => onApply(amount)} disabled={amount <= 0}
            className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:bg-primary/90">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
