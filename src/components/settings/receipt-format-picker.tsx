'use client';

import type { ReceiptFormatOption } from '@/lib/api/settings';
import { Check } from 'lucide-react';

/**
 * Receipt layout picker — radio-cards with a small visual mock of each layout so the
 * operator can SEE what they're choosing. Options come from pos-api's printing/layouts
 * registry (available_receipt_formats), so adding a layout server-side lights it up here
 * without a UI change; "Auto" is the recommended default (best layout per use case).
 */

const AUTO_OPTION: ReceiptFormatOption = {
  id: 'auto',
  label: 'Auto (recommended)',
  description: 'The platform picks the best layout for your business — the crisp thermal receipt.',
  paper: 'thermal',
};

/** Fallback list for offline/cached settings that predate available_receipt_formats. */
const FALLBACK_OPTIONS: ReceiptFormatOption[] = [
  { id: 'thermal_modern', label: 'Thermal — Modern', description: 'Receipt-roll layout in a bold sans-serif. Crisp high-contrast print (recommended for retail).', paper: 'thermal' },
  { id: 'thermal_classic', label: 'Thermal — Classic', description: 'Receipt-roll layout in bold monospace with dashed separators (the classic POS look).', paper: 'thermal' },
  { id: 'a4_invoice', label: 'A4 Invoice', description: 'Boxed invoice-style sheet with bordered tables and barcode, for regular A4 printers.', paper: 'a4' },
];

/** Tiny CSS mock of a layout: a narrow dashed thermal strip vs a boxed A4 sheet. */
function LayoutMock({ option }: { option: ReceiptFormatOption }) {
  const mono = option.id === 'thermal_classic' || option.id === 'auto';
  if (option.paper === 'a4') {
    return (
      <div className="mx-auto h-20 w-16 rounded-sm border-2 border-foreground/70 bg-background p-1 flex flex-col gap-0.5">
        <div className="h-3 border border-foreground/60 flex items-center justify-center">
          <div className="h-1 w-8 bg-foreground/70 rounded-sm" />
        </div>
        <div className="grid grid-cols-3 gap-px border border-foreground/50 p-px">
          <div className="h-1 bg-foreground/40" /><div className="h-1 bg-foreground/40" /><div className="h-1 bg-foreground/40" />
          <div className="h-1 bg-foreground/20" /><div className="h-1 bg-foreground/20" /><div className="h-1 bg-foreground/20" />
        </div>
        <div className="flex-1" />
        <div className="mx-auto h-1.5 w-8 bg-foreground/70" />
      </div>
    );
  }
  return (
    <div className="mx-auto h-20 w-10 rounded-sm border border-border bg-background px-1 py-1 flex flex-col items-center gap-0.5 shadow-sm">
      <div className={`h-1.5 ${mono ? 'w-6' : 'w-7'} bg-foreground/80 rounded-sm`} />
      <div className="w-full border-t border-dashed border-foreground/50 my-0.5" />
      <div className="w-full flex justify-between"><div className="h-1 w-3 bg-foreground/50" /><div className="h-1 w-2 bg-foreground/50" /></div>
      <div className="w-full flex justify-between"><div className="h-1 w-4 bg-foreground/50" /><div className="h-1 w-2 bg-foreground/50" /></div>
      <div className="w-full border-t border-dashed border-foreground/50 my-0.5" />
      <div className="w-full flex justify-between"><div className="h-1.5 w-3 bg-foreground/90" /><div className="h-1.5 w-3 bg-foreground/90" /></div>
      <div className="mt-auto h-3 w-3 border border-foreground/70 p-px">
        <div className="h-full w-full bg-[repeating-linear-gradient(45deg,transparent,transparent_1px,rgba(0,0,0,.55)_1px,rgba(0,0,0,.55)_2px)]" />
      </div>
    </div>
  );
}

interface ReceiptFormatPickerProps {
  value: string;
  options?: ReceiptFormatOption[];
  disabled?: boolean;
  onChange: (id: string) => void;
}

export function ReceiptFormatPicker({ value, options, disabled, onChange }: ReceiptFormatPickerProps) {
  const list = [AUTO_OPTION, ...((options && options.length > 0) ? options : FALLBACK_OPTIONS)];
  const selected = value || 'auto';
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Receipt Layout
      </label>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {list.map((opt) => {
          const active = selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.id)}
              aria-pressed={active}
              className={`relative rounded-xl border-2 p-3 text-left transition-colors ${
                active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {active && (
                <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="h-3 w-3" />
                </span>
              )}
              <LayoutMock option={opt} />
              <p className="mt-2 text-xs font-bold leading-tight">{opt.label}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{opt.description}</p>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Applies to printed, browser and PDF receipts for this outlet. Thermal layouts honour the
        station&apos;s paper size (58/80mm); A4 is for regular office printers only.
      </p>
    </div>
  );
}
