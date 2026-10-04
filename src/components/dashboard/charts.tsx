'use client';

/**
 * Dashboard analytics charts — revenue trend, category breakdown, top items. Thin presentation
 * layer over the SAME report endpoints/hooks the /reports/analytics page already uses
 * (useDailyBreakdown/useSalesByHour/useSalesByCategory/useTopItems from useReports.ts) — no new
 * backend aggregation, no re-implemented sums, so a chart here can never disagree with the
 * matching tab on the full Reports page.
 */

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useCallback, useMemo } from 'react';
import { BarChart3, Clock, Package, Tag } from 'lucide-react';
import { useDailyBreakdown, useSalesByCategory, useSalesByHour, useTopItems } from '@/hooks/useReports';
import { useEffectiveOutletID } from '@/hooks/usePOS';
import type { DashboardRange } from './range-filter';

export const CHART_COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))',
];

export function fmtFor(currency: string) {
  return (n: number) => `${currency} ${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Shared chart-card shell (title bar + loading/empty states) — reused outside this file (e.g.
 *  the hotel module's reports charts) so every analytics chart in the app looks identical. */
export function ChartCard({ title, icon: Icon, loading, empty, height = 'h-64', children }: {
  title: string; icon: React.ElementType; loading: boolean; empty: boolean; height?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
      ) : empty ? (
        <div className="p-6 text-center text-sm text-muted-foreground">No data for this range</div>
      ) : (
        <div className={`p-4 ${height}`}>{children}</div>
      )}
    </div>
  );
}

export const axisTick = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
export const tooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 };

// recharts 3 keeps each chart's axes and tooltip in an internal store and re-registers them
// whenever a prop changes identity. Inline objects and lambdas changed identity on every
// dashboard refetch, and those store dispatches piled up into React error #185 (maximum update
// depth). Static props live here as constants; data and formatters are memoized per chart.
const trendMargin = { left: 0, right: 8, top: 4, bottom: 4 };
const topItemsMargin = { left: 8, right: 16, top: 4, bottom: 4 };
const barCursor = { fill: 'hsl(var(--accent))' };
const areaCursor = { stroke: 'hsl(var(--primary))', strokeWidth: 1 };
const verticalBarRadius: [number, number, number, number] = [4, 4, 0, 0];
const horizontalBarRadius: [number, number, number, number] = [0, 4, 4, 0];

/** Stable axis and tooltip formatters for one currency. */
function useChartFormatters(currency: string) {
  const fmt = useMemo(() => fmtFor(currency), [currency]);
  const axisFormatter = useCallback((v: number) => fmt(v), [fmt]);
  const revenueTooltip = useCallback((v: unknown) => [fmt(Number(v ?? 0)), 'Revenue'] as [string, string], [fmt]);
  const namedTooltip = useCallback(
    (v: unknown, _n: unknown, item: any) => [fmt(Number(v ?? 0)), item?.payload?.name ?? 'Revenue'] as [string, string],
    [fmt],
  );
  return { fmt, axisFormatter, revenueTooltip, namedTooltip };
}

/** Shortens a category-axis label to a single line — recharts wraps a category tick's text
 *  across multiple tspans when it doesn't fit the axis width, and with 6-8 rows sharing a fixed
 *  chart height that wrapped 2nd line bleeds into the row above/below it (the overlapping labels
 *  bug). Truncating up front keeps every label one line; the untruncated name still shows in the
 *  tooltip via its own formatter, so nothing is actually lost. */
function truncateLabel(name: string, max = 14): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

/** Revenue over time — hour-of-day bars for the "Day" preset (a single day has no meaningful
 *  daily trend), otherwise a bucketed area chart sized to the selected range's granularity. */
export function RevenueTrendChart({ range, currency = 'KES' }: { range: DashboardRange; currency?: string }) {
  const { axisFormatter, revenueTooltip } = useChartFormatters(currency);
  const outletId = useEffectiveOutletID() || undefined;
  const hourQuery = useSalesByHour(range.chartTo, outletId);
  const dailyQuery = useDailyBreakdown(range.chartFrom, range.chartTo, !range.isSingleDay, range.granularity, outletId);
  const hourData = useMemo(
    () => (hourQuery.data ?? []).map((r) => ({ label: `${String(r.hour).padStart(2, '0')}:00`, revenue: r.revenue })),
    [hourQuery.data],
  );
  const dailyData = useMemo(
    () => (dailyQuery.data ?? []).map((r) => ({ label: r.date.slice(5), revenue: r.revenue })),
    [dailyQuery.data],
  );

  if (range.isSingleDay) {
    const data = hourData;
    return (
      <ChartCard title="Revenue by Hour" icon={Clock} loading={hourQuery.isLoading} empty={!data.some((d) => d.revenue > 0)}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={trendMargin}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval={2} />
            <YAxis tickFormatter={axisFormatter} tick={axisTick} axisLine={false} tickLine={false} width={70} />
            <Tooltip cursor={barCursor} contentStyle={tooltipStyle} formatter={revenueTooltip} />
            <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={verticalBarRadius} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  }

  const data = dailyData;
  return (
    <ChartCard title="Revenue Trend" icon={BarChart3} loading={dailyQuery.isLoading} empty={!data.some((d) => d.revenue > 0)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={trendMargin}>
          <defs>
            <linearGradient id="revenueTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tickFormatter={axisFormatter} tick={axisTick} axisLine={false} tickLine={false} width={70} />
          <Tooltip cursor={areaCursor} contentStyle={tooltipStyle} formatter={revenueTooltip} />
          <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#revenueTrendFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Revenue share by category — top 5 slices + an "Other" bucket for the rest, so a long tail of
 *  categories never renders as an unreadable 20-slice donut. */
export function CategoryBreakdownChart({ range, currency = 'KES' }: { range: DashboardRange; currency?: string }) {
  const { fmt, namedTooltip } = useChartFormatters(currency);
  const outletId = useEffectiveOutletID() || undefined;
  const query = useSalesByCategory(range.chartFrom, range.chartTo, outletId);
  const data = useMemo(() => {
    const rows = [...(query.data ?? [])].sort((a, b) => b.revenue - a.revenue);
    const otherRevenue = rows.slice(5).reduce((s, r) => s + r.revenue, 0);
    return [
      ...rows.slice(0, 5).map((r) => ({ name: r.category_name, revenue: r.revenue })),
      ...(otherRevenue > 0 ? [{ name: 'Other', revenue: otherRevenue }] : []),
    ];
  }, [query.data]);

  return (
    <ChartCard title="Sales by Category" icon={Tag} loading={query.isLoading} empty={!data.length}>
      <div className="flex items-center h-full gap-2">
        <ResponsiveContainer width="55%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="revenue" nameKey="name" innerRadius="55%" outerRadius="90%" paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="hsl(var(--card))" />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={namedTooltip} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 min-w-0 space-y-1.5 overflow-y-auto max-h-full pr-1">
          {data.map((d, i) => (
            <div key={`${d.name}-${i}`} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="truncate flex-1 text-muted-foreground">{d.name}</span>
              <span className="font-semibold tabular-nums shrink-0">{fmt(d.revenue)}</span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}

/** Top-selling items by revenue in the selected range — same single-hue horizontal-bar style as
 *  the Reports > Product Mix tab's category/station charts. */
export function TopItemsChart({ range, currency = 'KES' }: { range: DashboardRange; currency?: string }) {
  const { axisFormatter, namedTooltip } = useChartFormatters(currency);
  const outletId = useEffectiveOutletID() || undefined;
  const query = useTopItems(range.chartFrom, range.chartTo, 8, outletId);
  const data = useMemo(
    () => [...(query.data ?? [])]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((d) => ({ ...d, shortName: truncateLabel(d.name) })),
    [query.data],
  );

  return (
    <ChartCard title="Top Selling Items" icon={Package} loading={query.isLoading} empty={!data.length} height="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={topItemsMargin} barCategoryGap="22%">
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" tickFormatter={axisFormatter} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="shortName" width={92} interval={0} tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={barCursor}
            contentStyle={tooltipStyle}
            // Show the FULL (untruncated) item name in the tooltip — the axis label is shortened
            // to keep every row on one line, but nothing is actually lost.
            formatter={namedTooltip}
          />
          <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={horizontalBarRadius} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
