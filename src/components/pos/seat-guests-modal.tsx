'use client';

import { cn } from '@/lib/utils';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';

interface SeatGuestsModalProps {
  tableName: string;
  tableCapacity: number;
  onConfirm: (guestCount: number) => void;
  onBack: () => void;
}

export function SeatGuestsModal({ tableName, tableCapacity, onConfirm, onBack }: SeatGuestsModalProps) {
  const [count, setCount] = useState(Math.min(2, tableCapacity));

  const decrement = () => setCount((c) => Math.max(1, c - 1));
  const increment = () => setCount((c) => Math.min(tableCapacity, c + 1));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onBack}
    >
      <div
        className="bg-card rounded-3xl border border-border shadow-2xl w-72 p-8 flex flex-col items-center gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Chair icon */}
        <span className="text-5xl select-none">🪑</span>

        {/* Table name */}
        <div className="text-center">
          <p className="text-xl font-bold font-display">{tableName}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{tableCapacity} seats</p>
        </div>

        {/* Guest count spinner */}
        <div className="flex items-center gap-5">
          <button
            onClick={decrement}
            disabled={count <= 1}
            className={cn(
              'h-10 w-10 rounded-full border-2 border-border flex items-center justify-center transition-colors',
              count <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:border-primary hover:text-primary'
            )}
          >
            <Minus className="h-4 w-4" />
          </button>

          <span className="text-4xl font-bold font-display text-primary w-10 text-center">{count}</span>

          <button
            onClick={increment}
            disabled={count >= tableCapacity}
            className={cn(
              'h-10 w-10 rounded-full border-2 border-border flex items-center justify-center transition-colors',
              count >= tableCapacity ? 'opacity-30 cursor-not-allowed' : 'hover:border-primary hover:text-primary'
            )}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3 w-full mt-1">
          <button
            onClick={onBack}
            className="flex-1 py-3 rounded-2xl border-2 border-border text-sm font-semibold hover:bg-accent/30 transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => onConfirm(count)}
            className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Start Order
          </button>
        </div>
      </div>
    </div>
  );
}
