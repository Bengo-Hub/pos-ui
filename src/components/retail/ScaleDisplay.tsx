'use client';

import { cn } from '@/lib/utils';
import { Scale, ShoppingCart } from 'lucide-react';
import { useScaleReading } from '@/hooks/useRetail';

interface ScaleDisplayProps {
  tenantSlug: string;
  deviceId: string;
  onAddToCart?: (weightGrams: number) => void;
  className?: string;
}

export function ScaleDisplay({
  tenantSlug,
  deviceId,
  onAddToCart,
  className,
}: ScaleDisplayProps) {
  const { data: reading, isError } = useScaleReading(tenantSlug, deviceId, !!deviceId);

  const hasReading = !!reading && !isError;
  const weightKg = hasReading ? reading.weight_grams / 1000 : null;

  return (
    <div className={cn('bg-card border border-border rounded-2xl p-4', className)}>
      <div className="flex items-center gap-2 mb-3">
        <Scale className="h-4.5 w-4.5 text-muted-foreground" />
        <span className="text-sm font-semibold text-muted-foreground">Scale</span>
        <span
          className={cn(
            'ml-auto h-2 w-2 rounded-full',
            hasReading ? 'bg-green-500' : 'bg-gray-300',
          )}
        />
      </div>

      <div className="bg-zinc-950 rounded-xl px-4 py-3 flex items-end justify-center gap-2 border border-zinc-800 mb-3">
        <span
          className={cn(
            'font-mono text-3xl font-bold tabular-nums leading-none tracking-wider',
            hasReading ? 'text-green-400' : 'text-zinc-600',
          )}
        >
          {weightKg !== null ? weightKg.toFixed(3) : '---'}
        </span>
        <span
          className={cn(
            'font-mono text-base mb-0.5',
            hasReading ? 'text-green-600' : 'text-zinc-700',
          )}
        >
          kg
        </span>
      </div>

      {onAddToCart && (
        <button
          type="button"
          disabled={!hasReading || weightKg === null || weightKg <= 0}
          onClick={() => {
            if (reading && reading.weight_grams > 0) {
              onAddToCart(reading.weight_grams);
            }
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ShoppingCart className="h-4 w-4" />
          Add to Cart
        </button>
      )}
    </div>
  );
}
