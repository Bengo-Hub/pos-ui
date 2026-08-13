'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Card, CardContent } from '@/components/ui/base';
import { useMostProfitable, useProfitabilityGrouped, type ProfitabilityGroupBy } from '@/hooks/useReports';
import { useEffectiveOutletID } from '@/hooks/usePOS';
import { ReportExportButtons } from '@/components/reports/report-document-button';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker';
import { SalesListView } from '@/components/pos/sales/sales-list-view';
import { Coins, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { buildMostProfitableColumns, buildGroupColumns } from './profitability-columns';
import { cn } from '@/lib/utils';

function defaultRange(): DateRange {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(now) };
}

// One entry per Profitability tab. "products" and "invoice" are special-cased below (different
// data shape / a fully separate embedded view); everything else is a plain group_by value that
// shares the exact same {group, units_sold, revenue, profit, margin_pct} rollup shape.
const GROUP_TABS: { id: ProfitabilityGroupBy; label: string }[] = [
  { id: 'category', label: 'Categories' },
  { id: 'brand', label: 'Brands' },
  { id: 'outlet', label: 'Locations' },
  { id: 'day', label: 'Date' },
  { id: 'customer', label: 'Customer' },
  { id: 'staff', label: 'Service Staff' },
];
type TabId = 'products' | ProfitabilityGroupBy | 'invoice';

function GroupTabPanel({ groupBy, label, from, to, outletId, money }: {
  groupBy: ProfitabilityGroupBy; label: string; from: string; to: string; outletId?: string;
  money: (n: number) => string;
}) {
  const { data, isLoading } = useProfitabilityGrouped(from, to, groupBy, outletId);
  const groups = data?.groups ?? [];
  const columns = useMemo(() => buildGroupColumns(label, money), [label, money]);
  return (
    <Card>
      <CardContent className="p-2">
        <DataTable
          columns={columns}
          rows={groups}
          rowKey={(g) => g.group}
          loading={isLoading}
          storageKey={`profitability-${groupBy}-col-prefs`}
          emptyText="No sales data for this period."
        />
      </CardContent>
    </Card>
  );
}

function ProfitabilityContent() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [tab, setTab] = useState<TabId>('products');
  const { from, to } = range;

  const outletId = useEffectiveOutletID() || undefined;
  const { data, isLoading } = useMostProfitable(from, to, 20, outletId);
  const currency = data?.currency ?? 'KES';
  const items = data?.items ?? [];
  const totalRevenue = data?.total_revenue ?? 0;
  const totalProfit = data?.total_profit ?? 0;

  const money = (n: number) =>
    `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const columns = useMemo(() => buildMostProfitableColumns(money), [currency]);

  const activeGroupTab = GROUP_TABS.find((t) => t.id === tab);
  // The Products tab exports via the existing item-level PDF/CSV endpoint; every group_by tab
  // shares the new grouped export endpoint (report_pdf.go's ProfitabilityGroupedDocument) — one
  // handler server-side for all 7 dimensions, since they share one row shape.
  const exportProps = tab === 'products'
    ? { report: 'most-profitable-document', params: { from, to, outlet_id: outletId }, fileNameBase: `most-profitable-${to}`, title: 'Most Profitable Items', orientation: 'landscape' as const }
    : activeGroupTab
      ? { report: 'profitability-grouped-document', params: { from, to, group_by: activeGroupTab.id, outlet_id: outletId }, fileNameBase: `profitability-${activeGroupTab.id}-${to}`, title: `Profitability by ${activeGroupTab.label}`, orientation: 'landscape' as const }
      : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Profitability</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gross profit from finalized sales, by product, category, brand, location, date, customer, and staff
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <DateRangePicker value={range} onChange={setRange} className="w-64" />
          {exportProps && <ReportExportButtons {...exportProps} />}
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

      <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-accent/30 border border-border w-fit">
        {([{ id: 'products' as const, label: 'Products' }, ...GROUP_TABS, { id: 'invoice' as const, label: 'Invoice' }]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-3.5 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap',
              tab === t.id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'products' && (
        <Card>
          <CardContent className="p-2">
            <DataTable
              columns={columns}
              rows={items}
              rowKey={(it) => it.sku}
              loading={isLoading}
              storageKey="profitability-products-col-prefs"
              emptyText="No sales data for this period."
            />
          </CardContent>
        </Card>
      )}

      {activeGroupTab && (
        <GroupTabPanel groupBy={activeGroupTab.id} label={activeGroupTab.label} from={from} to={to} outletId={outletId} money={money} />
      )}

      {tab === 'invoice' && (
        // Reuses the SAME Sales list this session added Profit/Margin columns to (visible by
        // default there) — not a separate fetch. It manages its own date-range filter internally.
        <SalesListView orgSlug={orgSlug} title="Invoices" subtitle="Every sale, with profit and margin" />
      )}
    </div>
  );
}

export default function ProfitabilityPage() {
  return (
    <ModuleGate moduleKey="reports" fallback={<ModuleUnavailablePage />}>
      <ProfitabilityContent />
    </ModuleGate>
  );
}
