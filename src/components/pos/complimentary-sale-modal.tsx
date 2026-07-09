'use client';

import { useState } from 'react';
import { Gift, X } from 'lucide-react';

const COMPLIMENTARY_REASONS = [
  'Staff meal',
  "Director's order",
  'Goodwill / comp',
  'Vendor / technical visit',
  'Other',
] as const;

interface ComplimentarySaleModalProps {
  open: boolean;
  orderNumber: string;
  /** Preformatted amount being comped (e.g. "KES 1,700.00") — the whole bill, or just the
   *  remaining split portion when this is used inside a split-by-item payment (some items paid,
   *  the rest comped). */
  amountLabel?: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Reason capture for the Complimentary/no-charge tender — a mandatory reason is required before
 * the manager-approval step (ApprovalDialog) runs. Mirrors VoidOrderModal's reason-picker shape.
 */
export function ComplimentarySaleModal({ open, orderNumber, amountLabel, onClose, onConfirm }: ComplimentarySaleModalProps) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  if (!open) return null;

  const finalReason = reason === 'Other' ? customReason.trim() : reason;
  const valid = !!finalReason;

  function handleConfirm() {
    if (!finalReason) return;
    onConfirm(finalReason);
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Gift className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-base">Complimentary / No-Charge</h2>
              <p className="text-xs text-muted-foreground">
                Order #{orderNumber}
                {amountLabel ? ` · ${amountLabel}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          No cash will be collected — this closes as a complimentary expense in your books
          (revenue is still recorded, offset by a Complimentary &amp; Goodwill Expense line, so
          management can see what was given away). A reason and manager approval are required.
        </p>

        <div className="space-y-2 mb-4">
          {COMPLIMENTARY_REASONS.map((r) => (
            <label
              key={r}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                reason === r ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
              }`}
            >
              <input
                type="radio"
                name="complimentary-reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="accent-primary"
              />
              <span className="text-sm font-medium">{r}</span>
            </label>
          ))}
        </div>

        {reason === 'Other' && (
          <input
            autoFocus
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="Describe the reason"
            maxLength={200}
            className="w-full mb-4 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!valid}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            Continue to approval
          </button>
        </div>
      </div>
    </div>
  );
}
