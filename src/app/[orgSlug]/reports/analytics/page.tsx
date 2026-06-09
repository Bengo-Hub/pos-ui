'use client';

/**
 * Sales Analytics — surfaces the previously orphaned pos-api report endpoints
 * (sales-by-staff, sales-by-hour, sales-by-category). Reuses the existing useReports hooks; no new
 * data logic. Date-range driven.
 */

import { useState } from 'react';
import { BarChart3, Users, Clock, Tag } from 'lucide-react';
import { useSalesByStaff, useSalesByHour, useSalesByCategory } from '@/hooks/useReports';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => `KES ${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function AnalyticsReportPage() {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(todayISO());
  const staff = useSalesByStaff(from, to);
  const hours = useSalesByHour(from, to);
  const cats = useSalesByCategory(from, to);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Sales Analytics</h1>
        <div className="flex items-center gap-2 ml-auto">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          <span className="text-muted-foreground text-sm">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
      </div>

      <Section title="Sales by Staff" icon={Users} loading={staff.isLoading} empty={!staff.data?.length}
        head={['Staff', 'Orders', 'Revenue']}
        rows={(staff.data ?? []).map((r) => [`${r.user_id.slice(0, 8)}…`, String(r.order_count), fmt(r.revenue)])} />

      <Section title="Sales by Hour" icon={Clock} loading={hours.isLoading} empty={!hours.data?.length}
        head={['Hour', 'Orders', 'Revenue']}
        rows={(hours.data ?? []).map((r) => [`${String(r.hour).padStart(2, '0')}:00`, String(r.order_count), fmt(r.revenue)])} />

      <Section title="Sales by Category" icon={Tag} loading={cats.isLoading} empty={!cats.data?.length}
        head={['Category', 'Qty Sold', 'Revenue']}
        rows={(cats.data ?? []).map((r) => [r.category_name, String(r.quantity_sold), fmt(r.revenue)])} />
    </div>
  );
}

function Section({ title, icon: Icon, loading, empty, head, rows }: {
  title: string; icon: React.ElementType; loading: boolean; empty: boolean; head: string[]; rows: string[][];
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
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b border-border bg-muted/30">
              {head.map((h, i) => (
                <th key={h} className={i === 0 ? 'text-left px-5 py-2 font-medium' : 'text-right px-5 py-2 font-medium'}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={j === 0 ? 'px-5 py-2.5' : 'px-5 py-2.5 text-right tabular-nums'}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
