'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { Card, CardContent } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  Calendar,
  DollarSign,
  Loader2,
  Receipt,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';

const POS_API = process.env.NEXT_PUBLIC_POS_API_URL || 'https://posapi.codevertexitsolutions.com';

interface DailySummary {
  date: string;
  total_sales: number;
  order_count: number;
  avg_ticket: number;
  cash: number;
  card: number;
  mpesa: number;
  refunds: number;
}

const PERIODS = ['today', 'week', 'month'] as const;
type Period = typeof PERIODS[number];

const periodLabel: Record<Period, string> = { today: 'Today', week: 'This Week', month: 'This Month' };

export default function ReportsPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const token = useAuthStore((s) => s.session?.accessToken);
  const [period, setPeriod] = useState<Period>('today');

  const { data: summary, isLoading } = useQuery<DailySummary>({
    queryKey: ['pos-report', orgSlug, period],
    queryFn: async () => {
      const res = await fetch(`${POS_API}/v1/${orgSlug}/pos/reports/daily?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch report');
      return res.json();
    },
    enabled: !!token && !!orgSlug,
  });

  const kpis = summary
    ? [
        { label: 'Total Sales', value: `KES ${summary.total_sales.toLocaleString()}`, icon: DollarSign, color: 'text-green-600 bg-green-500/10' },
        { label: 'Orders', value: summary.order_count.toString(), icon: ShoppingCart, color: 'text-blue-600 bg-blue-500/10' },
        { label: 'Avg Ticket', value: `KES ${summary.avg_ticket.toLocaleString()}`, icon: Receipt, color: 'text-purple-600 bg-purple-500/10' },
        { label: 'Refunds', value: `KES ${summary.refunds.toLocaleString()}`, icon: TrendingUp, color: 'text-red-600 bg-red-500/10' },
      ]
    : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Sales and performance summary</p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {periodLabel[p]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : summary ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map(({ label, value, icon: Icon, color }) => (
              <Card key={label}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className={cn('size-11 rounded-xl flex items-center justify-center shrink-0', color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-bold text-foreground truncate">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Payment breakdown */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Payment Breakdown</p>
              </div>
              {[
                { label: 'Cash', amount: summary.cash, color: 'bg-green-500' },
                { label: 'Card', amount: summary.card, color: 'bg-blue-500' },
                { label: 'M-Pesa', amount: summary.mpesa, color: 'bg-emerald-500' },
              ].map(({ label, amount, color }) => {
                const pct = summary.total_sales > 0 ? (amount / summary.total_sales) * 100 : 0;
                return (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground font-medium">{label}</span>
                      <span className="text-muted-foreground">KES {amount.toLocaleString()} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <BarChart3 className="h-12 w-12 opacity-30" />
          <p>No report data available</p>
        </div>
      )}
    </div>
  );
}
