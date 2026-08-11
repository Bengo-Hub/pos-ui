'use client';

import { ReportDocumentButton } from '@/components/reports/report-document-button';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Card, CardContent } from '@/components/ui/base';
import {
  useSalesSummary,
  useRefundSummary,
  useDailyBreakdown,
  useTopItems,
  useSalesByStaff,
  downloadReportCSV,
  type Granularity,
} from '@/hooks/useReports';
import { useAuthStore } from '@/store/auth';
import { useEffectiveOutletID } from '@/hooks/usePOS';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  BarChart3,
  Coins,
  DollarSign,
  Download,
  Loader2,
  Package,
  ShoppingCart,
  TrendingDown,
  Users,
} from 'lucide-react';
import { useState } from 'react';

// Each drill-down granularity drives BOTH the trend bucket size and how far back the report
// range spans (enough buckets to be a meaningful trend). Buckets: day/week/month/quarter/
// half-year (semiannual = "bi-quarterly")/year.
const GRAN_OPTIONS: { key: Granularity; label: string; buckets: number }[] = [
  { key: 'day', label: 'Daily', buckets: 30 },
  { key: 'week', label: 'Weekly', buckets: 12 },
  { key: 'month', label: 'Monthly', buckets: 12 },
  { key: 'quarter', label: 'Quarterly', buckets: 8 },
  { key: 'semiannual', label: 'Half-Year', buckets: 6 },
  { key: 'year', label: 'Yearly', buckets: 5 },
];

function granularityToRange(gran: Granularity, buckets: number): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const start = new Date(now);
  switch (gran) {
    case 'day': start.setDate(now.getDate() - (buckets - 1)); break;
    case 'week': start.setDate(now.getDate() - (buckets - 1) * 7); break;
    case 'month': start.setMonth(now.getMonth() - (buckets - 1)); break;
    case 'quarter': start.setMonth(now.getMonth() - (buckets - 1) * 3); break;
    case 'semiannual': start.setMonth(now.getMonth() - (buckets - 1) * 6); break;
    case 'year': start.setFullYear(now.getFullYear() - (buckets - 1)); break;
  }
  return { from: fmt(start), to: fmt(now) };
}

// Human label for a bucket start date given the granularity.
function bucketLabel(dateISO: string, gran: Granularity): string {
  const d = new Date(dateISO + 'T00:00:00');
  const mon = d.toLocaleString(undefined, { month: 'short' });
  switch (gran) {
    case 'day': return dateISO.slice(5);
    case 'week': return `${mon} ${d.getDate()}`;
    case 'month': return `${mon} ${String(d.getFullYear()).slice(2)}`;
    case 'quarter': return `Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(2)}`;
    case 'semiannual': return `${d.getMonth() < 6 ? 'H1' : 'H2'} ${String(d.getFullYear()).slice(2)}`;
    case 'year': return String(d.getFullYear());
  }
}

function ReportsPage() {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const orgSlug = (useParams()?.orgSlug as string) || '';
  const outletId = useEffectiveOutletID() || undefined;
  const [gran, setGran] = useState<Granularity>('day');
  const [exporting, setExporting] = useState(false);
  const buckets = GRAN_OPTIONS.find((g) => g.key === gran)?.buckets ?? 30;
  const { from, to } = granularityToRange(gran, buckets);

  const { data: sales, isLoading: salesLoading, isError: salesError, refetch: refetchSales } = useSalesSummary(from, to, outletId);
  const { data: refunds } = useRefundSummary(from, to, outletId);
  const { data: daily = [] } = useDailyBreakdown(from, to, true, gran, outletId);
  const { data: topItems = [] } = useTopItems(from, to, 10, outletId);
  const { data: staffSales = [] } = useSalesByStaff(from, to, outletId);

  async function handleExport() {
    setExporting(true);
    try {
      await downloadReportCSV(tenantID, from, to);
    } catch {
      toast.error('Could not export the report. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  // Tenant's real currency, resolved server-side from POSOrder.Currency (falls back to "KES"
  // only when there's no order data at all) — used for every money figure on this page instead
  // of assuming KES.
  const currency = sales?.currency ?? 'KES';
  const money = (n: number) => `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  const kpis = sales
    ? [
        { label: 'Total Revenue', value: money(sales.total_revenue), icon: DollarSign, color: 'text-green-600 bg-green-500/10' },
        { label: 'Orders', value: sales.order_count.toString(), icon: ShoppingCart, color: 'text-blue-600 bg-blue-500/10' },
        { label: 'Gross Profit', value: `${money(sales.gross_profit)} (${(sales.gross_margin_pct ?? 0).toFixed(1)}%)`, icon: Coins, color: 'text-amber-600 bg-amber-500/10' },
        { label: 'Refunds', value: money(refunds?.total_refunded ?? 0), icon: TrendingDown, color: 'text-red-600 bg-red-500/10' },
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
          {GRAN_OPTIONS.map((g) => (
            <button
              key={g.key}
              onClick={() => setGran(g.key)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                gran === g.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {g.label}
            </button>
          ))}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export CSV
          </button>
          {/* Professional branded PDF documents (preview → print / download) for the current range. */}
          <ReportDocumentButton
            report="reset-summary"
            params={{ from, to }}
            fileName={`reset-summary-${to}.pdf`}
            title="Reset / Z Summary Report"
            label="Reset Summary"
            variant="outline"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          />
          <ReportDocumentButton
            report="sales-by-item-type"
            params={{ from, to }}
            fileName={`sales-by-item-type-${to}.pdf`}
            title="Sales by Item Type"
            label="Item-Type PDF"
            variant="outline"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          />
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
      ) : salesError ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <BarChart3 className="h-12 w-12 opacity-30" />
          <p>Couldn&apos;t load report data.</p>
          <button
            onClick={() => refetchSales()}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {kpis.map(({ label, value, icon: Icon, color }) => (
              <Card key={label}>
                <CardContent className="p-3.5 sm:p-5 flex items-center gap-3 sm:gap-4">
                  <div className={cn('size-9 sm:size-11 rounded-xl flex items-center justify-center shrink-0', color)}>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <div className="min-w-0">
                    {/* break-words, never truncate — these are financial figures; on a narrow
                     *  phone card the value wraps to a second line instead of clipping with an
                     *  ellipsis (was silently cutting off "KES 97,692.00 (40.1%)" mid-number). */}
                    <p className="text-base sm:text-xl font-bold leading-tight break-words">{value}</p>
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
                  { label: 'Gross Revenue', amount: sales.total_revenue + sales.total_discount - sales.total_tax },
                  { label: 'Tax Collected', amount: sales.total_tax },
                  { label: 'Discounts Given', amount: sales.total_discount },
                  { label: 'Gross Profit', amount: sales.gross_profit },
                ].map(({ label, amount }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{money(amount)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-5">
              <p className="text-sm font-semibold mb-4">
                {GRAN_OPTIONS.find((g) => g.key === gran)?.label ?? 'Revenue'} Revenue Trend
              </p>
              {daily.length === 0 || daily.every((r) => r.revenue === 0) ? (
                <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
                  No revenue recorded in this period.
                </div>
              ) : (
                <div className="flex items-end gap-1 h-32">
                  {daily.map((row) => {
                    const pct = maxRevenue > 0 ? (row.revenue / maxRevenue) * 100 : 0;
                    return (
                      <div key={row.date} className="flex-1 flex flex-col items-center gap-1 group" title={`${bucketLabel(row.date, gran)}: ${money(row.revenue)}`}>
                        <div className="w-full bg-primary/20 rounded-t-sm relative flex-1">
                          <div
                            className="absolute bottom-0 w-full bg-primary rounded-t-sm transition-all"
                            style={{ height: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-muted-foreground rotate-45 origin-left hidden sm:block whitespace-nowrap">
                          {bucketLabel(row.date, gran)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

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
                              {item.quantity_sold.toLocaleString()} sold · {money(item.revenue)}
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
                        <p className="font-medium text-foreground">{row.staff_name || `${row.user_id.slice(0, 8)}…`}</p>
                        <p className="text-xs text-muted-foreground">{row.order_count} orders</p>
                      </div>
                      <p className="font-semibold text-foreground">{money(row.revenue)}</p>
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
