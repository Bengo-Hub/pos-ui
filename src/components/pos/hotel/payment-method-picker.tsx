'use client';

import { Banknote, CreditCard, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The tender types the hotel folio settlement flow accepts — immediate desk collection only
 * (cash, or a manually-sighted card/M-Pesa confirmation), matching pos-api's
 * isImmediateHotelMethod exactly. An online gateway push belongs at the till's own payment
 * modal (payment-modal.tsx), not here — check-in/checkout never initiate one.
 *
 * Shared by CheckoutPanel (settle at checkout) and the check-in form's pay_upfront section,
 * which previously each hand-rolled the same three-button grid independently (and had drifted
 * to two different accent colors in the process) — one definition now.
 */
export const HOTEL_TENDER_METHODS: { key: string; label: string; icon: React.ElementType }[] = [
  { key: 'cash', label: 'Cash', icon: Banknote },
  { key: 'card_manual', label: 'Card / PDQ', icon: CreditCard },
  { key: 'mpesa', label: 'M-Pesa', icon: Smartphone },
];

export function HotelTenderPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {HOTEL_TENDER_METHODS.map((m) => {
        const Icon = m.icon;
        const selected = value === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key)}
            className={cn(
              'flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-colors',
              selected ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent',
            )}
          >
            <Icon className="h-4.5 w-4.5" />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
