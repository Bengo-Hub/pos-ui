'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useCaptureSerials } from '@/hooks/useRetail';

interface SerialCaptureModalProps {
  open: boolean;
  onClose: () => void;
  tenantSlug: string;
  orderId: string;
  lineId: string;
  requiredCount: number;
  itemName: string;
}

export function SerialCaptureModal({
  open,
  onClose,
  tenantSlug,
  orderId,
  lineId,
  requiredCount,
  itemName,
}: SerialCaptureModalProps) {
  const [serials, setSerials] = useState<string[]>([]);
  const { mutate: captureSerials, isPending, isError, error } = useCaptureSerials(tenantSlug);

  useEffect(() => {
    if (open) {
      setSerials(Array(requiredCount).fill(''));
    }
  }, [open, requiredCount]);

  if (!open) return null;

  const allFilled =
    serials.length === requiredCount && serials.every((s) => s.trim().length > 0);

  const handleChange = (index: number, value: string) => {
    setSerials((prev) => prev.map((s, i) => (i === index ? value : s)));
  };

  const handleSubmit = () => {
    if (!allFilled) return;
    captureSerials(
      { orderId, lineId, serials: serials.map((s) => s.trim()) },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-base">Serial Numbers Required</h3>
            <p className="text-sm text-muted-foreground truncate">{itemName}</p>
          </div>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-accent transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {serials.map((value, i) => (
            <div key={i}>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Serial #{i + 1}
              </label>
              <input
                value={value}
                onChange={(e) => handleChange(i, e.target.value)}
                placeholder={`Enter serial #${i + 1}…`}
                autoFocus={i === 0}
                className="w-full bg-background border border-border rounded-xl py-3 px-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
          ))}

          {isError && (
            <p className="text-sm text-destructive">
              {(error as any)?.message ?? 'Failed to save serials. Please try again.'}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-12 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!allFilled || isPending}
            onClick={handleSubmit}
            className="flex-1 min-h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isPending ? (
              <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : null}
            Confirm {requiredCount > 1 ? `${requiredCount} Serials` : 'Serial'}
          </button>
        </div>
      </div>
    </div>
  );
}
