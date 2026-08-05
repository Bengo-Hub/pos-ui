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
import { BarChart3, Clock, Package, Tag } from 'lucide-react';
import { useDailyBreakdown, useSalesByCategory, useSalesByHour, useTopItems } from '@/hooks/useReports';
import type { DashboardRange } from './range-filter';

const CHART_COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))',
];

function fmtFor(currency: string) {
  return (n: number) => `${currency} ${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function ChartCard({ title, icon: Icon, loading, empty, children }: {
  title: string; icon: React.ElementType; loading: boolean; empty: boolean; children: React.ReactNode;
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
        <div className="p-4 h-64">{children}</div>
      )}
    </div>
  );
}

const axisTick = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
const tooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 };

/** Revenue over time — hour-of-day bars for the "Day" preset (a single day has no meaningful
 *  daily trend), otherwise a bucketed area chart sized to the selected range's granularity. */
export function RevenueTrendChart({ range, currency = 'KES' }: { range: DashboardRange; currency?: string }) {
  const fmt = fmtFor(currency);
  const hourQuery = useSalesByHour(range.chartTo, undefined);
  const dailyQuery = useDailyBreakdown(range.chartFrom, range.chartTo, !range.isSingleDay, range.granularity);

  if (range.isSingleDay) {
    const data = (hourQuery.data ?? []).map((r) => ({ label: `${String(r.hour).padStart(2, '0')}:00`, revenue: r.revenue }));
    return (
      <ChartCard title="Revenue by Hour" icon={Clock} loading={hourQuery.isLoading} empty={!data.some((d) => d.revenue > 0)}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval={2} />
            <YAxis tickFormatter={(v) => fmt(v)} tick={axisTick} axisLine={false} tickLine={false} width={70} />
            <Tooltip cursor={{ fill: 'hsl(var(--accent))' }} contentStyle={tooltipStyle} formatter={(v) => [fmt(Number(v ?? 0)), 'Revenue']} />
            <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  }

  const data = (dailyQuery.data ?? []).map((r) => ({ label: r.date.slice(5), revenue: r.revenue }));
  return (
    <ChartCard title="Revenue Trend" icon={BarChart3} loading={dailyQuery.isLoading} empty={!data.some((d) => d.revenue > 0)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
          <defs>
            <linearGradient id="revenueTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tickFormatter={(v) => fmt(v)} tick={axisTick} axisLine={false} tickLine={false} width={70} />
          <Tooltip cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1 }} contentStyle={tooltipStyle} formatter={(v) => [fmt(Number(v ?? 0)), 'Revenue']} />
          <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#revenueTrendFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Revenue share by category — top 5 slices + an "Other" bucket for the rest, so a long tail of
 *  categories never renders as an unreadable 20-slice donut. */
export function CategoryBreakdownChart({ range, currency = 'KES' }: { range: DashboardRange; currency?: string }) {
  const fmt = fmtFor(currency);
  const query = useSalesByCategory(range.chartFrom, range.chartTo);
  const rows = [...(query.data ?? [])].sort((a, b) => b.revenue - a.revenue);
  const top = rows.slice(0, 5);
  const otherRevenue = rows.slice(5).reduce((s, r) => s + r.revenue, 0);
  const data = [
    ...top.map((r) => ({ name: r.category_name, revenue: r.revenue })),
    ...(otherRevenue > 0 ? [{ name: 'Other', revenue: otherRevenue }] : []),
  ];

  return (
    <ChartCard title="Sales by Category" icon={Tag} loading={query.isLoading} empty={!data.length}>
      <div className="flex items-center h-full gap-2">
        <ResponsiveContainer width="55%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="revenue" nameKey="name" innerRadius="55%" outerRadius="90%" paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="hsl(var(--card))" />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v, _n, item: any) => [fmt(Number(v ?? 0)), item?.payload?.name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 min-w-0 space-y-1.5 overflow-y-auto max-h-full pr-1">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
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
  const fmt = fmtFor(currency);
  const query = useTopItems(range.chartFrom, range.chartTo, 8);
  const data = [...(query.data ?? [])].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  return (
    <ChartCard title="Top Selling Items" icon={Package} loading={query.isLoading} empty={!data.length}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" tickFormatter={(v) => fmt(v)} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={110} tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'hsl(var(--accent))' }} contentStyle={tooltipStyle} formatter={(v) => [fmt(Number(v ?? 0)), 'Revenue']} />
          <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
