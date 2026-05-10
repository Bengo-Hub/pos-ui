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
    <div className="flex flex-col items-center gap-5 select-none w-full">
      {/* PIN dots */}
      <div className={cn('flex gap-3.5', shaking && 'animate-shake')}>
        {Array.from({ length: maxLength }).map((_, i) => {
          const filled = i < pin.length;
          return (
            <div
              key={i}
              className={cn(
                'h-3.5 w-3.5 rounded-full border-2 transition-all duration-200',
                shaking
                  ? 'border-destructive bg-destructive shadow-[0_0_8px_2px_rgba(239,68,68,0.5)]'
                  : filled
                  ? 'bg-primary border-primary scale-110 shadow-[0_0_10px_2px_rgba(234,128,34,0.45)]'
                  : 'bg-transparent border-white/35'
              )}
              style={filled && !shaking ? { animation: 'dot-fill 0.2s ease-out' } : undefined}
            />
          );
        })}
      </div>

      {/* Error message */}
      <p className={cn(
        'text-xs text-center min-h-4 -mt-2 transition-all duration-200',
        error ? 'text-red-400 opacity-100' : 'opacity-0'
      )}>
        {error ?? '​'}
      </p>

      {/* Key grid */}
      <div className="grid grid-cols-3 gap-2.5 w-full">
        {KEYS.map((key, idx) => (
          <button
            key={idx}
            onClick={() => handleKey(key)}
            disabled={loading || !key || shaking}
            className={cn(
              'h-14 rounded-2xl text-2xl font-bold transition-all duration-100 touch-manipulation',
              key === ''
                ? 'pointer-events-none invisible'
                : cn(
                    'bg-white/16 border border-white/28 text-white',
                    'shadow-[inset_0_1px_0_rgba(255,255,255,0.18),_0_2px_6px_rgba(0,0,0,0.35)]',
                    'hover:bg-white/24 hover:border-white/38',
                    'active:scale-90 active:bg-white/32',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                  ),
              key === '⌫' && 'text-lg'
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
          className="w-full h-13 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-95 disabled:opacity-50 transition-all touch-manipulation shadow-lg shadow-primary/30"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm PIN'}
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-white/60">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Verifying…
        </div>
      )}
    </div>
  );
}
