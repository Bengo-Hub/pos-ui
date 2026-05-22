'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const VOID_REASONS = [
  'Customer complaint',
  'Duplicate order',
  'System error',
  'Manager override',
  'Other',
] as const;

interface VoidOrderModalProps {
  orderId: string;
  orderNumber: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export function VoidOrderModal({ orderId: _orderId, orderNumber, open, onClose, onConfirm }: VoidOrderModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    if (!reason) return;
    setLoading(true);
    try {
      await onConfirm(reason);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h2 className="font-bold text-base">Void Order</h2>
              <p className="text-xs text-muted-foreground">Order #{orderNumber}</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Select a reason for voiding this order. This action cannot be undone.
          </p>

          <div className="space-y-2 mb-5">
            {VOID_REASONS.map((r) => (
              <label
                key={r}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                  reason === r
                    ? 'border-destructive bg-destructive/5 text-destructive'
                    : 'border-border hover:bg-accent'
                }`}
              >
                <input
                  type="radio"
                  name="void-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="accent-destructive"
                />
                <span className="text-sm font-medium">{r}</span>
              </label>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!reason || loading}
              className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-40"
            >
              {loading ? 'Voiding…' : 'Void Order'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
