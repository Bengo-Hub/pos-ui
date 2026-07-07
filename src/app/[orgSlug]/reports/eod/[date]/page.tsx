'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Card, CardContent } from '@/components/ui/base';
import { useEODList, useSalesByKDSStation } from '@/hooks/useReports';
import { ReportDocumentButton } from '@/components/reports/report-document-button';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { ArrowLeft, ChefHat, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

function EODDetailContent() {
  const { orgSlug, date } = useParams<{ orgSlug: string; date: string }>();
  const outletId = useAuthStore((s) => s.outlet?.id ?? '');

  const { data: closings = [], isLoading } = useEODList(outletId, date, date);
  const eod = closings[0] as any;
  // "How much did bar vs kitchen do today" — grouped by KDS station, same as the kitchen/bar
  // displays, so a manager closing the day can see each station's contribution at a glance.
  const stationBreakdown = useSalesByKDSStation(date, date, outletId);

  const STATUS_STYLES: Record<string, string> = {
    reconciled: 'bg-green-500/10 text-green-700',
    closed: 'bg-blue-500/10 text-blue-700',
    open: 'bg-yellow-500/10 text-yellow-700',
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!eod) {
    return (
      <div className="p-6 space-y-4">
        <Link href={`/${orgSlug}/reports/eod`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to EOD
        </Link>
        <Card><CardContent className="p-10 text-center text-muted-foreground">No closing found for {date}.</CardContent></Card>
      </div>
    );
  }

  const variance = eod.variance ?? 0;
  const dateFormatted = new Date(eod.business_date).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const tenderRows = [
    { label: 'Cash Sales', value: eod.total_sales - (eod.total_card ?? 0) - (eod.total_mpesa ?? 0) - (eod.total_room_charge ?? 0) },
    { label: 'Card', value: eod.total_card ?? 0 },
    { label: 'M-Pesa', value: eod.total_mpesa ?? 0 },
    { label: 'Room Charge', value: eod.total_room_charge ?? 0 },
    { label: 'Loyalty Redemptions', value: eod.total_loyalty_redemptions ?? 0 },
  ].filter(r => r.value > 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/${orgSlug}/reports/eod`} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{dateFormatted}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', STATUS_STYLES[eod.status] ?? STATUS_STYLES.open)}>
              {eod.status}
            </span>
            {eod.notes && <p className="text-xs text-muted-foreground">{eod.notes}</p>}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <ReportDocumentButton
            report="reset-summary"
            params={{ from: date, to: date }}
            fileName={`reset-summary-${date}.pdf`}
            title="Reset / Z Summary Report"
            label="Z Report"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          />
          <ReportDocumentButton
            report="daily-sales"
            params={{ from: date, to: date }}
            fileName={`daily-sales-${date}.pdf`}
            title="Daily Sales Report"
            label="Daily PDF"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          />
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Sales', value: `KES ${(eod.total_sales ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
          { label: 'Orders', value: (eod.total_orders ?? 0).toString() },
          { label: 'Refunds', value: `KES ${(eod.total_refunds ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
          { label: 'Tax Collected', value: `KES ${(eod.total_tax ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* KDS station breakdown — bar vs kitchen (vs any other configured station) */}
      {!stationBreakdown.isLoading && (stationBreakdown.data?.length ?? 0) > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ChefHat className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Sales by KDS Station</p>
              <div className="ml-auto">
                <ReportDocumentButton
                  report="sales-by-kds-station-document"
                  params={{ from: date, to: date, outlet_id: outletId }}
                  fileName={`sales-by-kds-station-${date}.pdf`}
                  title="Sales by KDS Station"
                  label="Export"
                  size="sm"
                  className="gap-1.5 h-7 text-xs px-2.5"
                />
              </div>
            </div>
            {(stationBreakdown.data ?? []).map((row) => (
              <div key={row.station_id || row.station_name} className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {row.station_name}{row.station_type ? ` (${row.station_type})` : ''} · {row.order_count} order{row.order_count === 1 ? '' : 's'}
                </span>
                <span className="font-medium">KES {row.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tender breakdown */}
      {tenderRows.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-semibold">Payment Method Breakdown</p>
            {tenderRows.map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">KES {value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Cash reconciliation */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <p className="text-sm font-semibold">Cash Reconciliation</p>
          {[
            { label: 'Expected Cash', value: eod.cash_expected ?? 0 },
            { label: 'Actual Cash (Counted)', value: eod.cash_actual ?? 0 },
            { label: 'Variance', value: variance, highlight: true },
          ].map(({ label, value, highlight }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className={cn('font-medium', highlight && value !== 0 ? (value < 0 ? 'text-red-600' : 'text-green-600') : '')}>
                {value < 0 ? '-' : ''}KES {Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function EODDetailPage() {
  return (
    <ModuleGate moduleKey="reports" fallback={<ModuleUnavailablePage />}>
      <EODDetailContent />
    </ModuleGate>
  );
}
