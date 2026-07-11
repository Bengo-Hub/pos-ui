'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar } from 'lucide-react';
import { format, startOfMonth, startOfDay, startOfWeek, subDays, startOfYear } from 'date-fns';
import { cn } from '@/lib/utils';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

// Quick presets — the REQ-002 period modes (Day / Week / Month / Year) plus the rolling
// windows, with the explicit Custom from/to pickers below.
const PRESETS: { label: string; range: () => DateRange }[] = [
  { label: 'Today', range: () => ({ from: fmt(startOfDay(new Date())), to: fmt(new Date()) }) },
  { label: 'This week', range: () => ({ from: fmt(startOfWeek(new Date(), { weekStartsOn: 1 })), to: fmt(new Date()) }) },
  { label: 'This month', range: () => ({ from: fmt(startOfMonth(new Date())), to: fmt(new Date()) }) },
  { label: 'This year', range: () => ({ from: fmt(startOfYear(new Date())), to: fmt(new Date()) }) },
  { label: 'Last 7 days', range: () => ({ from: fmt(subDays(new Date(), 6)), to: fmt(new Date()) }) },
  { label: 'Last 30 days', range: () => ({ from: fmt(subDays(new Date(), 29)), to: fmt(new Date()) }) },
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const label = value.from && value.to ? `${value.from} → ${value.to}` : 'All time';

  const PANEL_W = 288; // w-72

  // Anchor the panel to the trigger with fixed positioning so it escapes the Filters card's
  // `overflow-hidden` clipping, and keep it inside the viewport on narrow screens.
  const reposition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8));
    setPos({ top: r.bottom + 4, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const onScroll = () => reposition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 bg-accent/30 border border-border rounded-lg py-2 px-3 text-sm text-left hover:bg-accent transition-colors"
      >
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="truncate">{label}</span>
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: PANEL_W }}
            className="z-[70] rounded-xl border border-border bg-card shadow-xl p-3 space-y-3">
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
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider pt-2 border-t border-border">
              Custom range
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
        </>,
        document.body,
      )}
    </div>
  );
}
