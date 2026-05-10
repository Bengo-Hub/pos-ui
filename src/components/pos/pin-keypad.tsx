'use client';

import { useState, useCallback, useEffect } from 'react';
import { Delete, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PINKeypadProps {
  onConfirm: (pin: string) => void;
  loading?: boolean;
  error?: string | null;
  maxLength?: number;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export function PINKeypad({ onConfirm, loading, error, maxLength = 6 }: PINKeypadProps) {
  const [pin, setPin] = useState('');
  const [shaking, setShaking] = useState(false);

  // Trigger shake when error appears
  useEffect(() => {
    if (!error) return;
    setShaking(true);
    setPin('');
    const t = setTimeout(() => setShaking(false), 600);
    return () => clearTimeout(t);
  }, [error]);

  const handleKey = useCallback(
    (key: string) => {
      if (loading || shaking) return;
      if (key === '⌫') {
        setPin((p) => p.slice(0, -1));
        return;
      }
      if (!key) return;
      const next = pin + key;
      setPin(next);
      if (next.length >= maxLength) {
        onConfirm(next);
        setPin('');
      }
    },
    [loading, shaking, maxLength, onConfirm, pin]
  );

  const handleConfirm = () => {
    if (pin.length >= 4 && !loading) {
      onConfirm(pin);
      setPin('');
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 select-none w-full max-w-xs">
      {/* PIN dots */}
      <div className={cn('flex gap-4 py-2', shaking && 'animate-shake')}>
        {Array.from({ length: maxLength }).map((_, i) => {
          const filled = i < pin.length;
          return (
            <div
              key={i}
              className={cn(
                'h-4 w-4 rounded-full border-2 transition-all duration-200',
                filled
                  ? 'bg-primary border-primary scale-110 shadow-[0_0_8px_2px_rgba(234,128,34,0.4)]'
                  : 'bg-transparent border-white/40',
                shaking && filled && 'border-destructive bg-destructive shadow-[0_0_8px_2px_rgba(239,68,68,0.4)]'
              )}
              style={filled ? { animation: 'dot-fill 0.25s ease-out' } : undefined}
            />
          );
        })}
      </div>

      {/* Error message */}
      <p className={cn(
        'text-sm text-center min-h-5 transition-all duration-200',
        error ? 'text-red-400 opacity-100' : 'opacity-0'
      )}>
        {error ?? '‎'}
      </p>

      {/* Key grid */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {KEYS.map((key, idx) => (
          <button
            key={idx}
            onClick={() => handleKey(key)}
            disabled={loading || !key || shaking}
            className={cn(
              'h-14.5 rounded-2xl text-xl font-semibold transition-all duration-150',
              'active:scale-90 touch-manipulation',
              key === ''
                ? 'pointer-events-none invisible'
                : [
                    'bg-white/10 border border-white/20 text-white',
                    'hover:bg-white/20 hover:border-white/30',
                    'backdrop-blur-sm',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                  ].join(' '),
              key === '⌫' && 'text-base'
            )}
          >
            {key === '⌫'
              ? <Delete className="mx-auto h-5 w-5" />
              : key}
          </button>
        ))}
      </div>

      {/* Manual confirm (when PIN is 4–5 digits) */}
      {pin.length >= 4 && pin.length < maxLength && (
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full h-13 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-95 disabled:opacity-50 transition-all touch-manipulation"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm PIN'}
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verifying…
        </div>
      )}
    </div>
  );
}
