'use client';

import { Banknote, CreditCard, Smartphone, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { hotelTenderKeys, hotelTenderNeeds, type HotelTenderKey } from '@/lib/pos/hotel-tenders';
import { OTHER_REF_MAX, PAYMENT_LABEL_MAX } from '@/lib/pos/terminal-actions';

/**
 * The tender types the hotel folio settlement flow accepts: immediate desk collection only (cash,
 * a card/PDQ approval, an M-Pesa, MTN MoMo or Airtel Money code, or Other named by the desk),
 * matching pos-api's isImmediateHotelMethod. Codes get the till's format and duplicate checks on
 * the server. MTN and Airtel show only where the outlet has that number set. An online gateway
 * push belongs at the till's own payment modal (payment-modal.tsx), not here.
 *
 * Shared by CheckoutPanel (settle at checkout) and the check-in form's pay_upfront section.
 */
export const HOTEL_TENDER_METHODS: Record<HotelTenderKey, { label: string; icon: React.ElementType }> = {
  cash: { label: 'Cash', icon: Banknote },
  card_manual: { label: 'Card / PDQ', icon: CreditCard },
  mpesa: { label: 'M-Pesa', icon: Smartphone },
  mtn_momo_manual: { label: 'MTN MoMo', icon: Smartphone },
  airtel_money_manual: { label: 'Airtel Money', icon: Smartphone },
  other_manual: { label: 'Other', icon: Wallet },
};

export function HotelTenderPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const { data: posSettings } = usePOSSettings();
  const keys = hotelTenderKeys(posSettings as any);
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((key) => {
        const m = HOTEL_TENDER_METHODS[key];
        const Icon = m.icon;
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
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

/**
 * The code or label field for the chosen desk tender: a transaction code for M-Pesa, MTN and
 * Airtel (required), a label plus an optional reference for Other, and an optional approval ref
 * for card. Cash needs nothing.
 */
export function HotelTenderFields({
  method, reference, onReference, label, onLabel,
}: {
  method: string;
  reference: string;
  onReference: (v: string) => void;
  label: string;
  onLabel: (v: string) => void;
}) {
  const need = hotelTenderNeeds(method);
  const inputCls = 'mt-0.5 w-full bg-background border border-border rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none';
  if (need === 'code') {
    return (
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Transaction code</span>
        <input type="text" value={reference} maxLength={30} onChange={(e) => onReference(e.target.value.toUpperCase())}
          placeholder="Code from the customer's message" className={cn(inputCls, 'uppercase')} />
      </label>
    );
  }
  if (need === 'label') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">How they paid</span>
          <input type="text" value={label} maxLength={PAYMENT_LABEL_MAX} onChange={(e) => onLabel(e.target.value)}
            placeholder="e.g. Company voucher" className={inputCls} />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Ref (optional)</span>
          <input type="text" value={reference} maxLength={OTHER_REF_MAX} onChange={(e) => onReference(e.target.value)}
            className={inputCls} />
        </label>
      </div>
    );
  }
  if (method === 'card_manual') {
    return (
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Approval ref (optional)</span>
        <input type="text" value={reference} onChange={(e) => onReference(e.target.value.toUpperCase())}
          className={cn(inputCls, 'uppercase')} />
      </label>
    );
  }
  return null;
}
