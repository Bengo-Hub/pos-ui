'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Card, CardContent } from '@/components/ui/base';
import { useShiftReport } from '@/hooks/useReports';
import { useEffectiveOutletID } from '@/hooks/usePOS';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { cn, formatCurrency } from '@/lib/utils';
import { Calendar, Clock, DollarSign, Loader2, ShoppingCart } from 'lucide-react';
import { useState } from 'react';

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

const PERIODS = ['today', 'week', 'month'] as const;
type Period = (typeof PERIODS)[number];
const LABELS: Record<Period, string> = { today: 'Today', week: 'Last 7 days', month: 'This month' };

function periodRange(p: Period) {
  const now = new Date();
  if (p === 'today') return { from: fmt(now), to: fmt(now) };
  if (p === 'week') {
    const s = new Date(now); s.setDate(now.getDate() - 6);
    return { from: fmt(s), to: fmt(now) };
  }
  return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SessionsContent() {
  const [period, setPeriod] = useState<Period>('week');
  const { from, to } = periodRange(period);
  const outletId = useEffectiveOutletID() || undefined;
  const { data: sessions = [], isLoading } = useShiftReport(from, to, outletId);
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Shift Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">History of all device sessions and shift performance</p>
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
              {LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No sessions found for this period.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <Card key={s.shift_id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{formatDate(s.opened_at)}</span>
                      {s.closed_at && (
                        <span className="text-xs text-muted-foreground">→ {formatDate(s.closed_at)}</span>
                      )}
                    </div>
                    {s.cashier_name && (
                      <p className="text-xs text-muted-foreground pl-6">{s.cashier_name}</p>
                    )}
                    <div className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ml-6',
                      s.closed_at ? 'bg-green-500/10 text-green-700' : 'bg-yellow-500/10 text-yellow-700',
                    )}>
                      {s.closed_at ? 'Closed' : 'Open'}
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-bold">{s.order_count}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Orders</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-bold">
                          {formatCurrency(s.total_revenue, currency)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">Revenue</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SessionsPage() {
  return (
    <ModuleGate moduleKey="reports" fallback={<ModuleUnavailablePage />}>
      <SessionsContent />
    </ModuleGate>
  );
}
