'use client';

import { useState, useCallback } from 'react';
import { Delete, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PINKeypadProps {
  /** Called when the user confirms their entered PIN */
  onConfirm: (pin: string) => void;
  loading?: boolean;
  error?: string | null;
  /** Max digits before auto-submitting (default 6) */
  maxLength?: number;
  label?: string;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export function PINKeypad({ onConfirm, loading, error, maxLength = 6, label }: PINKeypadProps) {
  const [pin, setPin] = useState('');

  const handleKey = useCallback(
    (key: string) => {
      if (loading) return;
      if (key === '⌫') {
        setPin((p) => p.slice(0, -1));
        return;
      }
      if (key === '') return;
      const next = pin + key;
      setPin(next);
      if (next.length >= maxLength) {
        onConfirm(next);
        setPin('');
      }
    },
    [loading, maxLength, onConfirm, pin]
  );

  const handleConfirm = () => {
    if (pin.length >= 4) {
      onConfirm(pin);
      setPin('');
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 select-none">
      {label && <p className="text-sm text-muted-foreground">{label}</p>}

      {/* PIN dots */}
      <div className="flex gap-3">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-4 w-4 rounded-full border-2 transition-colors',
              i < pin.length
                ? 'bg-primary border-primary'
                : 'bg-transparent border-muted-foreground/40'
            )}
          />
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      {/* Key grid */}
      <div className="grid grid-cols-3 gap-3 w-64">
        {KEYS.map((key, idx) => (
          <button
            key={idx}
            onClick={() => handleKey(key)}
            disabled={loading || key === ''}
            className={cn(
              'h-16 rounded-2xl text-xl font-semibold transition-all active:scale-95',
              key === ''
                ? 'pointer-events-none'
                : 'bg-card border border-border hover:bg-accent hover:text-accent-foreground',
              key === '⌫' && 'text-base',
              loading && 'opacity-50 cursor-not-allowed'
            )}
          >
            {key === '⌫' ? <Delete className="mx-auto h-5 w-5" /> : key}
          </button>
        ))}
      </div>

      {/* Confirm button — shown when auto-submit doesn't fire (PIN < maxLength entered manually) */}
      {pin.length >= 4 && pin.length < maxLength && (
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-64 h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-all"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm PIN'}
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verifying…
        </div>
      )}
    </div>
  );
}
