'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { Card, CardContent } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  DollarSign,
  Loader2,
  Receipt,
  ShoppingCart,
  TrendingDown,
} from 'lucide-react';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

function periodToRange(period: 'today' | 'week' | 'month'): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (period === 'today') {
    return { from: fmt(now), to: fmt(now) };
  }
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

interface SalesSummary {
  from: string;
  to: string;
  order_count: number;
  total_revenue: number;
  total_tax: number;
  total_discount: number;
  avg_order_value: number;
}

interface RefundSummary {
  refund_count: number;
  total_refunded: number;
}

interface DayRow {
  date: string;
  revenue: number;
  order_count: number;
}

export default function ReportsPage() {
  const tenantID = useTenantID();
  const [period, setPeriod] = useState<Period>('today');
  const { from, to } = periodToRange(period);
  const base = `/api/v1/${tenantID}/pos/reports`;

  const { data: sales, isLoading: salesLoading } = useQuery<SalesSummary>({
    queryKey: ['reports-sales', tenantID, from, to],
    queryFn: () => apiClient.get<SalesSummary>(`${base}/sales-summary`, { from, to }),
    enabled: !!tenantID,
  });

  const { data: refunds } = useQuery<RefundSummary>({
    queryKey: ['reports-refunds', tenantID, from, to],
    queryFn: () => apiClient.get<RefundSummary>(`${base}/refund-summary`, { from, to }),
    enabled: !!tenantID,
  });

  const { data: daily = [] } = useQuery<DayRow[]>({
    queryKey: ['reports-daily', tenantID, from, to],
    queryFn: () => apiClient.get<DayRow[]>(`${base}/daily-breakdown`, { from, to }),
    enabled: !!tenantID && period !== 'today',
  });

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
        <div className="flex gap-2">
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
        </div>
      </div>

      {salesLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* KPI cards */}
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

          {/* Tax & discount breakdown */}
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
                ].map(({ label, amount, color }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">KES {amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Daily chart (week/month only) */}
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
