'use client';

import { Button } from '@/components/ui/base';
import { Scale } from 'lucide-react';

interface ScaleDisplayProps {
  weightKg: number | null;
  unit?: string;
  itemName?: string;
  onConfirm: (weightKg: number) => void;
  onCancel: () => void;
}

export function ScaleDisplay({
  weightKg,
  unit = 'kg',
  itemName,
  onConfirm,
  onCancel,
}: ScaleDisplayProps) {
  const formatted =
    weightKg !== null ? weightKg.toFixed(3) : '---';

  return (
    <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm">
      <div className="flex items-center gap-2 mb-5">
        <Scale className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-base">Weighing Scale</h3>
      </div>

      {itemName && (
        <p className="text-sm text-muted-foreground mb-4 truncate">
          Item: <span className="font-semibold text-foreground">{itemName}</span>
        </p>
      )}

      {/* Digital readout */}
      <div className="bg-zinc-950 rounded-xl p-5 mb-6 flex items-end justify-center gap-3 border border-zinc-800">
        <span className="font-mono text-5xl font-bold text-green-400 tabular-nums leading-none tracking-wider">
          {formatted}
        </span>
        <span className="font-mono text-xl text-green-600 mb-1">{unit}</span>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1 min-h-12" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="flex-1 min-h-12"
          disabled={weightKg === null || weightKg <= 0}
          onClick={() => {
            if (weightKg !== null && weightKg > 0) onConfirm(weightKg);
          }}
        >
          Confirm Weight
        </Button>
      </div>
    </div>
  );
}
