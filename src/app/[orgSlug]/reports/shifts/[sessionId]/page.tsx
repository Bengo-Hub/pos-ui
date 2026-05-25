'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Card, CardContent } from '@/components/ui/base';
import { useShiftReportDetail } from '@/hooks/useReports';
import { ArrowLeft, Clock, DollarSign, Loader2, ShoppingCart, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

function fmt(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function KPI({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`size-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ShiftDetailContent() {
  const { orgSlug, sessionId } = useParams<{ orgSlug: string; sessionId: string }>();
  const { data: shift, isLoading, isError } = useShiftReportDetail(sessionId);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (isError || !shift) {
    return (
      <div className="p-6 space-y-4">
        <Link href={`/${orgSlug}/reports/shifts`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Shifts
        </Link>
        <Card><CardContent className="p-10 text-center text-muted-foreground">Shift not found.</CardContent></Card>
      </div>
    );
  }

  const duration = shift.ended_at
    ? Math.round((new Date(shift.ended_at).getTime() - new Date(shift.started_at).getTime()) / 60000)
    : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/${orgSlug}/reports/shifts`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Shift Detail</h1>
          <p className="text-sm text-muted-foreground">
            {fmt(shift.started_at)}
            {shift.ended_at ? ` → ${fmt(shift.ended_at)}` : ' (open)'}
            {duration ? ` · ${duration} min` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Orders" value={shift.order_count.toString()} icon={ShoppingCart} color="text-blue-600 bg-blue-500/10" />
        <KPI label="Net Sales" value={`KES ${shift.net_sales.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} icon={DollarSign} color="text-green-600 bg-green-500/10" />
        <KPI label="Tax Collected" value={`KES ${shift.total_tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} icon={DollarSign} color="text-yellow-600 bg-yellow-500/10" />
        <KPI label="Refunds" value={`KES ${shift.total_refunds.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} icon={TrendingDown} color="text-red-600 bg-red-500/10" />
      </div>

      <Card>
        <CardContent className="p-5 space-y-3">
          <p className="text-sm font-semibold">Summary</p>
          {[
            { label: 'Gross Revenue', value: shift.total_revenue },
            { label: 'Discounts', value: -shift.total_discounts },
            { label: 'Refunds', value: -shift.total_refunds },
            { label: 'Net Sales', value: shift.net_sales },
            { label: 'Tax (incl.)', value: shift.total_tax },
            { label: 'Opening Float', value: shift.opening_cash },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className={`font-medium ${value < 0 ? 'text-red-600' : ''}`}>
                KES {Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Session ID: {shift.session_id}
      </div>
    </div>
  );
}

export default function ShiftDetailPage() {
  return (
    <ModuleGate moduleKey="pos.reports" fallback={<ModuleUnavailablePage />}>
      <ShiftDetailContent />
    </ModuleGate>
  );
}
