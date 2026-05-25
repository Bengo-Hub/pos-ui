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
    <div className="flex flex-col items-center gap-5 select-none w-full">
      <div className={cn('flex gap-4', shaking && 'animate-shake')}>
        {Array.from({ length: maxLength }).map((_, i) => {
          const filled = i < pin.length;
          return (
            <div
              key={i}
              className={cn(
                'h-4 w-4 rounded-full border-2 transition-all duration-200',
                shaking
                  ? 'border-destructive bg-destructive shadow-[0_0_10px_2px_rgba(239,68,68,0.5)]'
                  : filled
                  ? 'bg-primary border-primary scale-110 shadow-[0_0_12px_2px_rgba(234,128,34,0.45)]'
                  : 'bg-transparent border-white/30'
              )}
              style={filled && !shaking ? { animation: 'dot-fill 0.2s ease-out' } : undefined}
            />
          );
        })}
      </div>

      <p className={cn(
        'text-xs text-center min-h-4 -mt-2 transition-all duration-200',
        error ? 'text-red-400 opacity-100' : 'opacity-0'
      )}>
        {error ?? '​'}
      </p>

      <div className="grid grid-cols-3 gap-3 w-full">
        {KEYS.map((key, idx) => (
          <button
            key={idx}
            onClick={() => handleKey(key)}
            disabled={loading || !key || shaking}
            className={cn(
              'h-16 rounded-2xl text-2xl font-bold transition-all duration-100 touch-manipulation',
              key === ''
                ? 'pointer-events-none invisible'
                : cn(
                    'bg-white/14 border border-white/25 text-white',
                    'shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_3px_8px_rgba(0,0,0,0.4)]',
                    'hover:bg-white/22 hover:border-white/35 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_12px_rgba(0,0,0,0.45)]',
                    'active:scale-90 active:bg-white/30',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                  ),
              key === '⌫' && 'text-lg'
            )}
          >
            {key === '⌫' ? <Delete className="mx-auto h-5 w-5" /> : key}
          </button>
        ))}
      </div>
    </div>
  );
}
