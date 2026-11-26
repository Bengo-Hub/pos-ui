'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useVoidReasons, type VoidReason } from '@/hooks/usePOS';

interface VoidOrderModalProps {
  orderId: string;
  orderNumber: string;
  open: boolean;
  onClose: () => void;
  /** reason is the label shown on reports; reasonCode is the outlet void reason code, which
   *  decides on the server whether prepared items are consumed as wastage. */
  onConfirm: (reason: string, reasonCode?: string) => Promise<void>;
}

export function VoidOrderModal({ orderId: _orderId, orderNumber, open, onClose, onConfirm }: VoidOrderModalProps) {
  const { data: reasons } = useVoidReasons();
  const [selected, setSelected] = useState<VoidReason | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    if (!selected) return;
    setLoading(true);
    try {
      await onConfirm(selected.label, selected.code);
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
            {(reasons ?? []).map((r) => (
              <label
                key={r.code}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                  selected?.code === r.code
                    ? 'border-destructive bg-destructive/5 text-destructive'
                    : 'border-border hover:bg-accent'
                }`}
              >
                <input
                  type="radio"
                  name="void-reason"
                  value={r.code}
                  checked={selected?.code === r.code}
                  onChange={() => setSelected(r)}
                  className="accent-destructive"
                />
                <span className="text-sm font-medium flex-1">{r.label}</span>
                {r.record_wastage && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    Records wastage
                  </span>
                )}
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
              disabled={!selected || loading}
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
