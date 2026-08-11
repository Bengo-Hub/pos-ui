'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Card, CardContent } from '@/components/ui/base';
import { useMostProfitable } from '@/hooks/useReports';
import { useEffectiveOutletID } from '@/hooks/usePOS';
import { ReportDocumentButton } from '@/components/reports/report-document-button';
import { Coins, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { buildMostProfitableColumns } from './most-profitable-columns';

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

  const outletId = useEffectiveOutletID() || undefined;
  const { data, isLoading } = useMostProfitable(from, to, 20, outletId);
  const currency = data?.currency ?? 'KES';
  const items = data?.items ?? [];
  const totalRevenue = data?.total_revenue ?? 0;
  const totalProfit = data?.total_profit ?? 0;

  const money = (n: number) =>
    `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const columns = useMemo(() => buildMostProfitableColumns(money), [currency]);

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
          <ReportDocumentButton
            report="most-profitable-document"
            params={{ from, to }}
            fileName={`most-profitable-${to}.pdf`}
            title="Most Profitable Items"
            orientation="landscape"
            label="Print / Export"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          />
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

      <Card>
        <CardContent className="p-2">
          <DataTable
            columns={columns}
            rows={items}
            rowKey={(it) => it.sku}
            loading={isLoading}
            storageKey="most-profitable-col-prefs"
            emptyText="No sales data for this period."
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function MostProfitablePage() {
  return (
    <ModuleGate moduleKey="reports" fallback={<ModuleUnavailablePage />}>
      <MostProfitableContent />
    </ModuleGate>
  );
}
