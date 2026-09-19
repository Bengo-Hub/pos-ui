'use client';

/**
 * Hotel Reports charts — daily occupancy/ADR/revenue trend, room-type performance, and
 * booking-source mix. Thin presentation layer over useHotelOccupancyTrend (pos-api's
 * ReportsHandler.HotelOccupancyTrend), reusing the SAME ChartCard/axisTick/tooltipStyle/
 * CHART_COLORS primitives the dashboard's own charts.tsx already established, so a hotel chart
 * never looks or behaves differently from the rest of the app's analytics.
 */

import {
  Area, Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { BedDouble, Building2, Users } from 'lucide-react';
import { ChartCard, CHART_COLORS, axisTick, tooltipStyle, fmtFor } from '@/components/dashboard/charts';
import type { HotelOccupancyTrendResult } from '@/hooks/useReports';

const ROOM_TYPE_LABELS: Record<string, string> = {
  standard: 'Standard', deluxe: 'Deluxe', suite: 'Suite', presidential: 'Presidential', other: 'Other',
};

const SOURCE_LABELS: Record<string, string> = {
  staff: 'Front Desk', online: 'Self-Service Widget', api: 'API / Channel Manager',
};

interface HotelChartsProps {
  data?: HotelOccupancyTrendResult;
  isLoading: boolean;
  currency?: string;
}

/** Occupancy % (line, right axis) laid over room-vs-ancillary revenue (stacked bars, left axis)
 *  — the single chart that answers "are we full, and is that translating into money" at a
 *  glance, which neither metric alone can. */
export function HotelOccupancyTrendChart({ data, isLoading, currency = 'KES' }: HotelChartsProps) {
  const fmt = fmtFor(currency);
  const buckets = data?.buckets ?? [];
  const chartData = buckets.map((b) => ({
    label: b.date.slice(5),
    room_revenue: b.room_revenue,
    ancillary_revenue: b.ancillary_revenue,
    occupancy_pct: Math.round(b.occupancy_rate * 1000) / 10,
  }));
  const empty = !chartData.some((d) => d.room_revenue > 0 || d.ancillary_revenue > 0 || d.occupancy_pct > 0);

  return (
    <ChartCard title="Occupancy &amp; Revenue Trend" icon={BedDouble} loading={isLoading} empty={empty} height="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
          <defs>
            <linearGradient id="hotelOccupancyLine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis yAxisId="revenue" tickFormatter={(v) => fmt(v)} tick={axisTick} axisLine={false} tickLine={false} width={70} />
          <YAxis
            yAxisId="occupancy"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--accent))' }}
            contentStyle={tooltipStyle}
            formatter={(v, name) => {
              if (name === 'occupancy_pct') return [`${v}%`, 'Occupancy'];
              return [fmt(Number(v ?? 0)), name === 'room_revenue' ? 'Room Revenue' : 'Ancillary Revenue'];
            }}
          />
          <Bar yAxisId="revenue" dataKey="room_revenue" stackId="rev" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} maxBarSize={22} />
          <Bar yAxisId="revenue" dataKey="ancillary_revenue" stackId="rev" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Area yAxisId="occupancy" type="monotone" dataKey="occupancy_pct" stroke="none" fill="url(#hotelOccupancyLine)" />
          <Line yAxisId="occupancy" type="monotone" dataKey="occupancy_pct" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Revenue + occupancy by room type — which room types actually earn their keep. Most useful
 *  once a property has more than one type (BOI's G/F rooms are both "standard" today, so this
 *  renders one bar until room types are differentiated, which is still an honest answer). */
export function RoomTypePerformanceChart({ data, isLoading, currency = 'KES' }: HotelChartsProps) {
  const fmt = fmtFor(currency);
  const rows = [...(data?.room_type_breakdown ?? [])].sort((a, b) => b.revenue - a.revenue);
  const chartData = rows.map((r) => ({
    name: ROOM_TYPE_LABELS[r.room_type] ?? r.room_type,
    revenue: r.revenue,
    occupancy_pct: Math.round(r.occupancy_rate * 1000) / 10,
    room_count: r.room_count,
  }));

  return (
    <ChartCard title="Performance by Room Type" icon={Building2} loading={isLoading} empty={!chartData.length} height="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" tickFormatter={(v) => fmt(v)} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={90} tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'hsl(var(--accent))' }}
            contentStyle={tooltipStyle}
            formatter={(v, name, item: any) => {
              if (name === 'revenue') return [fmt(Number(v ?? 0)), `Revenue (${item?.payload?.room_count} room${item?.payload?.room_count === 1 ? '' : 's'})`];
              return [v, name];
            }}
          />
          <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} maxBarSize={26}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** How guests are actually booking — front desk walk-ins vs the self-service widget vs an API/
 *  channel manager. A property investing in the self-service widget wants to see that slice grow. */
export function BookingSourceChart({ data, isLoading }: HotelChartsProps) {
  const rows = data?.booking_source_breakdown ?? [];
  const chartData = rows
    .filter((r) => r.bookings > 0)
    .map((r) => ({ name: SOURCE_LABELS[r.source] ?? r.source, bookings: r.bookings }));

  return (
    <ChartCard title="Bookings by Source" icon={Users} loading={isLoading} empty={!chartData.length} height="h-56">
      <div className="flex items-center h-full gap-2">
        <ResponsiveContainer width="50%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="bookings" nameKey="name" innerRadius="55%" outerRadius="90%" paddingAngle={2}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="hsl(var(--card))" />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v, _n, item: any) => [v, item?.payload?.name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 min-w-0 space-y-1.5">
          {chartData.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="truncate flex-1 text-muted-foreground">{d.name}</span>
              <span className="font-semibold tabular-nums shrink-0">{d.bookings}</span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}
