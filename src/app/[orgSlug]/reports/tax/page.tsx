'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Card, CardContent } from '@/components/ui/base';
import { useTaxReport } from '@/hooks/useReports';
import { cn } from '@/lib/utils';
import { Download, Loader2, Receipt } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/store/auth';

function periodRange(p: 'today' | 'week' | 'month') {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (p === 'today') return { from: fmt(now), to: fmt(now) };
  if (p === 'week') { const s = new Date(now); s.setDate(now.getDate() - 6); return { from: fmt(s), to: fmt(now) }; }
  return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
}

function TaxReportContent() {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('month');
  const { from, to } = periodRange(period);
  const { data: rows = [], isLoading } = useTaxReport(from, to);

  const totalTax = rows.reduce((sum, r) => sum + r.tax_collected, 0);
  const totalTaxable = rows.reduce((sum, r) => sum + r.taxable_amount, 0);

  const exportUrl = `/api/v1/${tenantID}/pos/reports/export?from=${from}&to=${to}&type=tax`;
  const LABELS = { today: 'Today', week: 'Last 7 days', month: 'This month' };
  const PERIODS = ['today', 'week', 'month'] as const;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tax Report</h1>
          <p className="text-sm text-muted-foreground mt-1">VAT collected by tax type — for KRA eTIMS compliance</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {PERIODS.map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn('px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                period === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
              {LABELS[p]}
            </button>
          ))}
          <a href={exportUrl} download className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
            <Download className="h-3.5 w-3.5" /> Export
          </a>
        </div>
      </div>

      {totalTax > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="size-11 rounded-xl bg-yellow-500/10 text-yellow-600 flex items-center justify-center shrink-0">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold">KES {totalTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                <p className="text-xs text-muted-foreground">Total Tax Collected</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="size-11 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold">KES {totalTaxable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                <p className="text-xs text-muted-foreground">Total Taxable Amount</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">No tax data for this period.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 text-muted-foreground font-medium">Tax Type</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Rate</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Taxable Amount</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Tax Collected</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tax_name} className="border-b last:border-0">
                    <td className="p-4 font-medium">{r.tax_name}</td>
                    <td className="p-4 text-right text-muted-foreground">{r.rate}%</td>
                    <td className="p-4 text-right">KES {r.taxable_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="p-4 text-right font-semibold text-yellow-700">KES {r.tax_collected.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr className="bg-muted/40">
                  <td colSpan={2} className="p-4 font-semibold">Total</td>
                  <td className="p-4 text-right font-semibold">KES {totalTaxable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="p-4 text-right font-semibold text-yellow-700">KES {totalTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function TaxReportPage() {
  return (
    <ModuleGate moduleKey="pos.reports" fallback={<ModuleUnavailablePage />}>
      <TaxReportContent />
    </ModuleGate>
  );
}
