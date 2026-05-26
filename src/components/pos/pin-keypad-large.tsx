'use client';

import { cn } from '@/lib/utils';
import { Delete } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export interface PINKeypadLargeProps {
  onConfirm: (pin: string) => void;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
}

export function PINKeypadLarge({ onConfirm, loading, error, disabled }: PINKeypadLargeProps) {
  const maxLength = 4;
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
      if (loading || shaking || disabled) return;
      if (key === '⌫') { setPin((p) => p.slice(0, -1)); return; }
      if (!key) return;
      const next = pin + key;
      setPin(next);
      if (next.length >= maxLength) {
        onConfirm(next);
        setPin('');
      }
    },
    [loading, shaking, disabled, maxLength, onConfirm, pin]
  );

  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <div className="flex flex-col items-center gap-6 select-none w-full">
      {/* PIN indicator dots */}
      <div className={cn('flex gap-5 items-center', shaking && 'animate-shake')}>
        {Array.from({ length: maxLength }).map((_, i) => {
          const filled = i < pin.length;
          return (
            <div key={i} className="relative flex items-center justify-center h-6 w-6">
              {/* Glow ring behind filled dot */}
              {filled && !shaking && (
                <div
                  className="absolute inset-0 rounded-full blur-md animate-dot-pulse"
                  style={{ background: 'hsl(var(--primary) / 0.55)' }}
                />
              )}
              <div
                className={cn(
                  'relative h-[17px] w-[17px] rounded-full border-2 transition-all duration-200',
                  shaking
                    ? 'border-destructive bg-destructive shadow-[0_0_16px_5px_rgba(239,68,68,0.55)]'
                    : filled
                    ? 'bg-primary border-primary scale-[1.18] shadow-[0_0_18px_4px_hsl(var(--primary)/0.45),inset_0_1px_0_rgba(255,255,255,0.45)] animate-dot-fill'
                    : 'bg-transparent border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]'
                )}
              />
            </div>
          );
        })}
      </div>

      {/* Error message */}
      <p className={cn(
        'text-xs text-center min-h-4 -mt-3 transition-all duration-200',
        error ? 'text-red-400 opacity-100' : 'opacity-0'
      )}>
        {error ?? '​'}
      </p>

      {/* Key grid */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {KEYS.map((key, idx) => (
          <button
            key={idx}
            onClick={() => handleKey(key)}
            disabled={loading || !key || shaking}
            className={cn(
              'h-[66px] rounded-2xl text-2xl font-bold transition-all duration-100 touch-manipulation',
              key === ''
                ? 'pointer-events-none invisible'
                : cn(
                    'relative overflow-hidden',
                    'bg-white/10 border border-white/20 text-white',
                    // Layered shadow: top inner highlight + bottom inner shadow + outer drop shadow
                    'shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.3),0_4px_14px_rgba(0,0,0,0.55)]',
                    'hover:bg-white/17 hover:border-white/30',
                    'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.3),0_6px_18px_rgba(0,0,0,0.6)]',
                    'active:scale-[0.87] active:bg-white/24 active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.45)]',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                  ),
              key === '⌫' && 'text-lg'
            )}
          >
            {/* Top glass highlight line */}
            {key !== '' && (
              <span className="pointer-events-none absolute inset-x-3 top-2 h-px bg-white/20 rounded-full" />
            )}
            {key === '⌫' ? <Delete className="mx-auto h-[18px] w-[18px]" /> : key}
          </button>
        ))}
      </div>
    </div>
  );
}
