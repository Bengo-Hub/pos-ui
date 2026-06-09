'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Card, CardContent } from '@/components/ui/base';
import {
  useSalesSummary,
  useRefundSummary,
  useDailyBreakdown,
  useTopItems,
  useSalesByStaff,
  useReportExportUrl,
} from '@/hooks/useReports';
import { useAuthStore } from '@/store/auth';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  DollarSign,
  Download,
  Loader2,
  Package,
  Receipt,
  ShoppingCart,
  TrendingDown,
  Users,
} from 'lucide-react';
import { useState } from 'react';

function periodToRange(period: 'today' | 'week' | 'month'): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (period === 'today') return { from: fmt(now), to: fmt(now) };
  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { from: fmt(start), to: fmt(now) };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: fmt(start), to: fmt(now) };
}

const PERIODS = ['today', 'week', 'month'] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_LABELS: Record<Period, string> = { today: 'Today', week: 'This Week', month: 'This Month' };

function ReportsPage() {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const orgSlug = (useParams()?.orgSlug as string) || '';
  const [period, setPeriod] = useState<Period>('today');
  const { from, to } = periodToRange(period);

  const { data: sales, isLoading: salesLoading } = useSalesSummary(from, to);
  const { data: refunds } = useRefundSummary(from, to);
  const { data: daily = [] } = useDailyBreakdown(from, to, period !== 'today');
  const { data: topItems = [] } = useTopItems(from, to);
  const { data: staffSales = [] } = useSalesByStaff(from, to);
  const exportUrl = useReportExportUrl(tenantID, from, to);

  const kpis = sales
    ? [
        { label: 'Total Revenue', value: `KES ${sales.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'text-green-600 bg-green-500/10' },
        { label: 'Orders', value: sales.order_count.toString(), icon: ShoppingCart, color: 'text-blue-600 bg-blue-500/10' },
        { label: 'Avg Order', value: `KES ${sales.avg_order_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: Receipt, color: 'text-purple-600 bg-purple-500/10' },
        { label: 'Refunds', value: `KES ${(refunds?.total_refunded ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: TrendingDown, color: 'text-red-600 bg-red-500/10' },
      ]
    : [];

  const maxRevenue = daily.reduce((m, r) => Math.max(m, r.revenue), 1);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Sales and performance summary</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                period === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <a
            href={exportUrl}
            download
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </a>
          <Link
            href={`/${orgSlug}/reports/analytics`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Analytics
          </Link>
        </div>
      </div>

      {salesLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map(({ label, value, icon: Icon, color }) => (
              <Card key={label}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className={cn('size-11 rounded-xl flex items-center justify-center shrink-0', color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-bold truncate">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {sales && (sales.total_tax > 0 || sales.total_discount > 0) && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">Revenue Breakdown</p>
                </div>
                {[
                  { label: 'Gross Revenue', amount: sales.total_revenue + sales.total_discount - sales.total_tax, color: 'bg-primary' },
                  { label: 'Tax Collected', amount: sales.total_tax, color: 'bg-yellow-500' },
                  { label: 'Discounts Given', amount: sales.total_discount, color: 'bg-red-400' },
                ].map(({ label, amount }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">KES {amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {daily.length > 1 && (
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-4">Daily Revenue</p>
                <div className="flex items-end gap-1 h-32">
                  {daily.map((row) => {
                    const pct = maxRevenue > 0 ? (row.revenue / maxRevenue) * 100 : 0;
                    return (
                      <div key={row.date} className="flex-1 flex flex-col items-center gap-1 group" title={`${row.date}: KES ${row.revenue.toLocaleString()}`}>
                        <div className="w-full bg-primary/20 rounded-t-sm relative" style={{ height: '100%' }}>
                          <div
                            className="absolute bottom-0 w-full bg-primary rounded-t-sm transition-all"
                            style={{ height: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-muted-foreground rotate-45 origin-left hidden sm:block">
                          {row.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {topItems.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">Top Selling Items</p>
                </div>
                <div className="space-y-2">
                  {topItems.map((item, idx) => {
                    const maxRev = topItems[0]?.revenue ?? 1;
                    const pct = Math.round((item.revenue / maxRev) * 100);
                    return (
                      <div key={item.sku} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-sm font-medium truncate">{item.name}</span>
                            <span className="text-xs text-muted-foreground ml-2 shrink-0">
                              {item.quantity_sold.toLocaleString()} sold · KES {item.revenue.toLocaleString()}
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {staffSales.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">Sales by Staff</p>
                </div>
                <div className="divide-y divide-border">
                  {staffSales.map((row) => (
                    <div key={row.user_id} className="flex items-center justify-between py-2.5 text-sm">
                      <div>
                        <p className="font-medium text-foreground font-mono text-xs">{row.user_id.slice(0, 8)}…</p>
                        <p className="text-xs text-muted-foreground">{row.order_count} orders</p>
                      </div>
                      <p className="font-semibold text-foreground">KES {row.revenue.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {!sales && (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
              <BarChart3 className="h-12 w-12 opacity-30" />
              <p>No report data available</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ReportsPageGated() {
  return (
    <ModuleGate moduleKey="reports" fallback={<ModuleUnavailablePage moduleKey="reports" />}>
      <ReportsPage />
    </ModuleGate>
  );
}
