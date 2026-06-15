'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Card, CardContent } from '@/components/ui/base';
import { useShiftReport } from '@/hooks/useReports';
import { cn } from '@/lib/utils';
import { Clock, DollarSign, Loader2, ShoppingCart, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

function fmt(d: Date) { return d.toISOString().slice(0, 10); }
function periodRange(p: 'today' | 'week' | 'month') {
  const now = new Date();
  if (p === 'today') return { from: fmt(now), to: fmt(now) };
  if (p === 'week') { const s = new Date(now); s.setDate(now.getDate() - 6); return { from: fmt(s), to: fmt(now) }; }
  return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
}

function ShiftsReportContent() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const { from, to } = periodRange(period);
  const { data: sessions = [], isLoading } = useShiftReport(from, to);

  const PERIODS = ['today', 'week', 'month'] as const;
  const LABELS = { today: 'Today', week: 'Last 7 days', month: 'This month' };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Shift Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Performance breakdown by staff shift session</p>
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
      ) : sessions.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">No shifts found for this period.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <Link key={s.shift_id} href={`/${orgSlug}/reports/shifts/${s.shift_id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">
                          {new Date(s.opened_at).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })}
                          {' '}
                          {new Date(s.opened_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {s.cashier_name && <p className="text-xs text-muted-foreground pl-6">{s.cashier_name}</p>}
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ml-6',
                        s.closed_at ? 'bg-green-500/10 text-green-700' : 'bg-yellow-500/10 text-yellow-700')}>
                        {s.closed_at ? 'Closed' : 'Open'}
                      </span>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-bold">{s.order_count}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Orders</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">KES {s.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        <p className="text-xs text-muted-foreground">Revenue</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ShiftsReportPage() {
  return (
    <ModuleGate moduleKey="reports" fallback={<ModuleUnavailablePage />}>
      <ShiftsReportContent />
    </ModuleGate>
  );
}
