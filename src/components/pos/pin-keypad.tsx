'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { PinKeypad } from '@/components/pos/pin-login-keyboards';

interface PINKeypadProps {
  onConfirm: (pin: string) => void;
  loading?: boolean;
  error?: string | null;
  /** Number of digits before the PIN auto-submits. Staff PINs are 4 digits. */
  maxLength?: number;
}

/**
 * PINKeypad — self-contained numeric PIN entry for the manager-approval dialogs.
 *
 * This is a thin STATEFUL ADAPTER around the shared, brand-styled <PinKeypad> used on
 * the PIN-login screen. It owns only the digit buffer, the PIN dots and auto-submit;
 * the actual key grid is the ONE well-designed keypad component, so there is no
 * duplicate keypad UI. Exposes the simple `onConfirm(pin)` API the dialogs already use.
 */
export function PINKeypad({ onConfirm, loading, error, maxLength = 4 }: PINKeypadProps) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shaking, setShaking] = useState(false);

  // A new error from the parent (rejected PIN) shakes the dots and clears the buffer.
  useEffect(() => {
    if (!error) return;
    setShaking(true);
    setDigits([]);
    const t = setTimeout(() => setShaking(false), 600);
    return () => clearTimeout(t);
  }, [error]);

  const handleDigit = useCallback((d: string) => {
    if (loading || shaking) return;
    setDigits((prev) => {
      if (prev.length >= maxLength) return prev;
      const next = [...prev, d];
      if (next.length === maxLength) {
        onConfirm(next.join(''));
        return []; // reset while the parent verifies (matches the login keypad)
      }
      return next;
    });
  }, [loading, shaking, maxLength, onConfirm]);

  const handleBackspace = useCallback(() => {
    if (loading || shaking) return;
    setDigits((prev) => prev.slice(0, -1));
  }, [loading, shaking]);

  const handleClear = useCallback(() => {
    if (loading || shaking) return;
    setDigits([]);
  }, [loading, shaking]);

  return (
    <div className="flex w-full flex-col items-center gap-4 select-none">
      {/* PIN progress dots */}
      <div className={cn('flex gap-3', shaking && 'animate-shake')}>
        {Array.from({ length: maxLength }).map((_, i) => {
          const filled = i < digits.length;
          return (
            <div
              key={i}
              className={cn(
                'h-3.5 w-3.5 rounded-full border-2 transition-all duration-200',
                shaking
                  ? 'border-destructive bg-destructive'
                  : filled
                  ? 'bg-primary border-primary scale-110 shadow-[0_0_10px_2px_hsl(var(--primary)/0.4)]'
                  : 'bg-transparent border-border'
              )}
            />
          );
        })}
      </div>

      {error && <p className="min-h-4 -mt-1 text-center text-xs text-destructive">{error}</p>}

      <div className="mx-auto w-full max-w-xs">
        <PinKeypad
          onDigit={handleDigit}
          onBackspace={handleBackspace}
          onClear={handleClear}
          disabled={!!loading || shaking}
          isSubmitting={!!loading}
          digitsLength={digits.length}
          pinLength={maxLength}
          showToggle={false}
        />
      </div>
    </div>
  );
}
