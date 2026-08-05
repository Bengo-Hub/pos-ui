'use client';

/**
 * Dashboard analytics date-range filter — Day (default) / Week / Bi-Weekly / Monthly / Quarterly /
 * Semi-Annual / Annual rolling windows, plus a Custom range via the existing DateRangePicker.
 * Powers both the KPI cards (useDashboardSummary) and the new dashboard charts so every widget on
 * a role dashboard stays in sync with a single selection.
 */

import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker';
import type { Granularity } from '@/hooks/useReports';
import { cn } from '@/lib/utils';

export type RangePreset = 'day' | 'week' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'custom';

const PRESET_DAYS: Record<Exclude<RangePreset, 'day' | 'custom'>, number> = {
  week: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 90,
  semiannual: 182,
  annual: 365,
};

const PRESET_LABELS: { id: RangePreset; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'biweekly', label: 'Bi-Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'semiannual', label: 'Semi-Annual' },
  { id: 'annual', label: 'Annual' },
  { id: 'custom', label: 'Custom' },
];

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
const todayISO = () => fmt(new Date());

/** Bucket size for the trend chart, scaled to how wide the selected range is — a year-long
 *  window bucketed by day would render an unreadable multi-thousand-point chart. */
export function pickGranularity(from: string, to: string): Granularity {
  const days = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000 + 1;
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  if (days <= 400) return 'month';
  return 'quarter';
}

export interface DashboardRange {
  preset: RangePreset;
  /** Undefined for the "Day" preset — omitting from/to lets GetSummary use its original
   *  today-vs-yesterday default rather than an equivalent-but-redundant explicit range. */
  from?: string;
  to?: string;
  /** Always concrete (today/today for the Day preset) — the report endpoints backing the new
   *  charts (daily-breakdown, sales-by-category, top-items…) require a real from/to regardless
   *  of whether the KPI card call above omits it. */
  chartFrom: string;
  chartTo: string;
  granularity: Granularity;
  /** KPI card sub-label — "vs yesterday" only makes sense for the Day preset. */
  compareLabel: string;
  /** True for the Day preset — trend chart should use hour-of-day (Sales by Hour), not the
   *  single-bucket daily breakdown. */
  isSingleDay: boolean;
}

function computeRange(preset: RangePreset, custom: DateRange): DashboardRange {
  if (preset === 'day') {
    const today = todayISO();
    return { preset, chartFrom: today, chartTo: today, granularity: 'day', compareLabel: 'vs yesterday', isSingleDay: true };
  }
  if (preset === 'custom') {
    const from = custom.from || todayISO();
    const to = custom.to || todayISO();
    return {
      preset, from, to, chartFrom: from, chartTo: to,
      granularity: pickGranularity(from, to), compareLabel: 'vs previous period', isSingleDay: from === to,
    };
  }
  const days = PRESET_DAYS[preset];
  const to = todayISO();
  const from = fmt(subDays(new Date(), days - 1));
  return {
    preset, from, to, chartFrom: from, chartTo: to,
    granularity: pickGranularity(from, to), compareLabel: 'vs previous period', isSingleDay: false,
  };
}

export function useDashboardRange() {
  const [preset, setPreset] = useState<RangePreset>('day');
  const [custom, setCustom] = useState<DateRange>({ from: todayISO(), to: todayISO() });
  const range = computeRange(preset, custom);
  return { range, preset, setPreset, custom, setCustom };
}

export function DashboardRangeFilter({
  preset,
  setPreset,
  custom,
  setCustom,
}: {
  preset: RangePreset;
  setPreset: (p: RangePreset) => void;
  custom: DateRange;
  setCustom: (r: DateRange) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
      {/* Horizontal scroll (not wrap) on narrow phones — 8 pills wrapped into 3-4 rows ate too
       *  much vertical space; a single scrollable row matches how filter chips behave in most
       *  mobile apps. -mx-1 px-1 keeps the scroll edges from clipping the first/last pill's ring. */}
      <div className="flex gap-1 p-1 rounded-lg bg-accent/30 border border-border overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-1 max-w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PRESET_LABELS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setPreset(p.id);
              setShowCustom(p.id === 'custom');
            }}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all shrink-0',
              preset === p.id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {showCustom && <DateRangePicker value={custom} onChange={setCustom} className="w-60" />}
    </div>
  );
}
