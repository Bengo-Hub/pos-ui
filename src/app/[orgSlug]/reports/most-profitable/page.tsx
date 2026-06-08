'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Card, CardContent } from '@/components/ui/base';
import { useMostProfitable } from '@/hooks/useReports';
import { Coins, Loader2, TrendingUp } from 'lucide-react';
import { useState } from 'react';

function defaultRange() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(now) };
}

function MostProfitableContent() {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const { data, isLoading } = useMostProfitable(from, to, 20);
  const currency = data?.currency ?? 'KES';
  const items = data?.items ?? [];
  const totalRevenue = data?.total_revenue ?? 0;
  const totalProfit = data?.total_profit ?? 0;

  const money = (n: number) =>
    `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Most Profitable Items</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Items ranked by profit from finalized sales over the selected period
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <label className="flex flex-col text-xs text-muted-foreground gap-1">
            From
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm bg-muted text-foreground border border-transparent focus:border-primary outline-none"
            />
          </label>
          <label className="flex flex-col text-xs text-muted-foreground gap-1">
            To
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm bg-muted text-foreground border border-transparent focus:border-primary outline-none"
            />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-11 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-bold">{money(totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-11 rounded-xl bg-green-500/10 text-green-600 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-bold">{money(totalProfit)}</p>
              <p className="text-xs text-muted-foreground">Total Profit</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No sales data for this period.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 text-muted-foreground font-medium">Item</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Units Sold</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Revenue</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Unit Cost</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Profit</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.sku} className="border-b last:border-0">
                    <td className="p-4">
                      <div className="font-medium">{it.name || it.sku}</div>
                      <div className="text-xs text-muted-foreground">{it.sku}</div>
                    </td>
                    <td className="p-4 text-right">
                      {it.units_sold.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-right">{money(it.revenue)}</td>
                    <td className="p-4 text-right text-muted-foreground">{money(it.unit_cost)}</td>
                    <td className="p-4 text-right font-semibold text-green-700">{money(it.profit)}</td>
                    <td className="p-4 text-right">
                      {it.margin_pct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/40">
                  <td colSpan={2} className="p-4 font-semibold">Total</td>
                  <td className="p-4 text-right font-semibold">{money(totalRevenue)}</td>
                  <td className="p-4" />
                  <td className="p-4 text-right font-semibold text-green-700">{money(totalProfit)}</td>
                  <td className="p-4" />
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function MostProfitablePage() {
  return (
    <ModuleGate moduleKey="pos.reports" fallback={<ModuleUnavailablePage />}>
      <MostProfitableContent />
    </ModuleGate>
  );
}
