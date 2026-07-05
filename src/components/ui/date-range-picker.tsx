'use client';

import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { format, startOfMonth, startOfDay, subDays, startOfYear } from 'date-fns';
import { cn } from '@/lib/utils';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

// Quick presets mirroring the GoDigital date-range dropdown.
const PRESETS: { label: string; range: () => DateRange }[] = [
  { label: 'Today', range: () => ({ from: fmt(startOfDay(new Date())), to: fmt(new Date()) }) },
  { label: 'Last 7 days', range: () => ({ from: fmt(subDays(new Date(), 6)), to: fmt(new Date()) }) },
  { label: 'Last 30 days', range: () => ({ from: fmt(subDays(new Date(), 29)), to: fmt(new Date()) }) },
  { label: 'This month', range: () => ({ from: fmt(startOfMonth(new Date())), to: fmt(new Date()) }) },
  { label: 'This year', range: () => ({ from: fmt(startOfYear(new Date())), to: fmt(new Date()) }) },
];

/**
 * DateRangePicker — a lightweight from/to picker with quick presets. Uses native date inputs
 * (no external calendar dependency) styled to match the POS filter bar. Powers the All-Sales
 * "Date Range" filter.
 */
export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = value.from && value.to ? `${value.from} → ${value.to}` : 'All time';

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 bg-accent/30 border border-border rounded-lg py-2 px-3 text-sm text-left hover:bg-accent transition-colors"
      >
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="truncate">{label}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-72 rounded-xl border border-border bg-card shadow-xl p-3 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => { onChange(p.range()); setOpen(false); }}
                  className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-semibold text-muted-foreground">
                From
                <input
                  type="date"
                  value={value.from}
                  max={value.to || undefined}
                  onChange={(e) => onChange({ ...value, from: e.target.value })}
                  className="mt-0.5 w-full bg-background border border-border rounded-md py-1.5 px-2 text-xs"
                />
              </label>
              <label className="text-[11px] font-semibold text-muted-foreground">
                To
                <input
                  type="date"
                  value={value.to}
                  min={value.from || undefined}
                  onChange={(e) => onChange({ ...value, to: e.target.value })}
                  className="mt-0.5 w-full bg-background border border-border rounded-md py-1.5 px-2 text-xs"
                />
              </label>
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => { onChange({ from: '', to: '' }); setOpen(false); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-xs font-semibold px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
