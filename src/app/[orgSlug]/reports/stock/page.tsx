'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Card, CardContent } from '@/components/ui/base';
import { useTopItems } from '@/hooks/useReports';
import { useEffectiveOutletID } from '@/hooks/usePOS';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { cn, formatCurrency } from '@/lib/utils';
import { Loader2, Package, TrendingUp } from 'lucide-react';
import { useState } from 'react';

function periodRange(p: 'today' | 'week' | 'month') {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (p === 'today') return { from: fmt(now), to: fmt(now) };
  if (p === 'week') { const s = new Date(now); s.setDate(now.getDate() - 6); return { from: fmt(s), to: fmt(now) }; }
  return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
}

function StockReportContent() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const { from, to } = periodRange(period);
  const outletId = useEffectiveOutletID() || undefined;
  const { data: items = [], isLoading } = useTopItems(from, to, 50, outletId);
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';

  const totalQty = items.reduce((s, i) => s + i.quantity_sold, 0);
  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);
  const maxQty = items.reduce((m, i) => Math.max(m, i.quantity_sold), 1);

  const LABELS = { today: 'Today', week: 'Last 7 days', month: 'This month' };
  const PERIODS = ['today', 'week', 'month'] as const;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Stock Consumption</h1>
          <p className="text-sm text-muted-foreground mt-1">Items sold by quantity — use for reorder planning</p>
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

      {totalQty > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="size-11 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold">{totalQty.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Units Sold</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="size-11 rounded-xl bg-green-500/10 text-green-600 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold">{formatCurrency(totalRevenue, currency)}</p>
                <p className="text-xs text-muted-foreground">Revenue from Listed Items</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">No stock data for this period.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-5 space-y-4">
            <p className="text-sm font-semibold">Items by Volume Sold</p>
            {items.map((item) => {
              const pct = maxQty > 0 ? (item.quantity_sold / maxQty) * 100 : 0;
              return (
                <div key={item.sku} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <span className="font-medium truncate block">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.sku}</span>
                    </div>
                    <div className="text-right ml-4 shrink-0">
                      <span className="font-semibold">{item.quantity_sold.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground ml-1">units</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function StockReportPage() {
  return (
    <ModuleGate moduleKey="reports" fallback={<ModuleUnavailablePage />}>
      <StockReportContent />
    </ModuleGate>
  );
}
