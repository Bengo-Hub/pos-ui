'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Card, CardContent } from '@/components/ui/base';
import { useRefundSummary } from '@/hooks/useReports';
import { useEffectiveOutletID } from '@/hooks/usePOS';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { cn, formatCurrency } from '@/lib/utils';
import { Loader2, TrendingDown } from 'lucide-react';
import { useState } from 'react';

function periodRange(p: 'today' | 'week' | 'month') {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (p === 'today') return { from: fmt(now), to: fmt(now) };
  if (p === 'week') { const s = new Date(now); s.setDate(now.getDate() - 6); return { from: fmt(s), to: fmt(now) }; }
  return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
}

function ReturnsReportContent() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('month');
  const { from, to } = periodRange(period);
  const outletId = useEffectiveOutletID() || undefined;
  const { data: summary, isLoading } = useRefundSummary(from, to, outletId);
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';

  const LABELS = { today: 'Today', week: 'Last 7 days', month: 'This month' };
  const PERIODS = ['today', 'week', 'month'] as const;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Returns &amp; Refunds</h1>
          <p className="text-sm text-muted-foreground mt-1">Refund totals and return counts for this period</p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn('px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                period === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
              {LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="size-11 rounded-xl bg-red-500/10 text-red-600 flex items-center justify-center shrink-0">
                <TrendingDown className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold">{formatCurrency(summary?.total_refunded ?? 0, currency)}</p>
                <p className="text-xs text-muted-foreground">Total Refunded</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="size-11 rounded-xl bg-orange-500/10 text-orange-600 flex items-center justify-center shrink-0">
                <TrendingDown className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold">{(summary?.refund_count ?? 0).toString()}</p>
                <p className="text-xs text-muted-foreground">Return Count</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!isLoading && summary && summary.refund_count === 0 && (
        <Card><CardContent className="p-10 text-center text-muted-foreground">No returns for this period.</CardContent></Card>
      )}

      {!isLoading && summary && summary.refund_count > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-semibold">Summary</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Number of Returns</span>
              <span className="font-medium">{summary.refund_count}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Amount Refunded</span>
              <span className="font-medium text-red-600">
                {formatCurrency(summary.total_refunded, currency)}
              </span>
            </div>
            {summary.refund_count > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avg Refund Value</span>
                <span className="font-medium">
                  {formatCurrency(summary.total_refunded / summary.refund_count, currency)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ReturnsReportPage() {
  return (
    <ModuleGate moduleKey="reports" fallback={<ModuleUnavailablePage />}>
      <ReturnsReportContent />
    </ModuleGate>
  );
}
