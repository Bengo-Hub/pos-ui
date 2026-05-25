'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Card, CardContent } from '@/components/ui/base';
import { useEODList } from '@/hooks/useReports';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { Calendar, CheckCircle2, ChevronRight, Clock, DollarSign, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const STATUS_STYLES: Record<string, string> = {
  reconciled: 'bg-green-500/10 text-green-700',
  closed: 'bg-blue-500/10 text-blue-700',
  open: 'bg-yellow-500/10 text-yellow-700',
};

function EODContent() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const outletId = useAuthStore((s) => s.outlet?.id ?? '');

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);

  const { data: closings = [], isLoading } = useEODList(outletId, from, to);

  if (!outletId) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-10 text-center text-muted-foreground">Select an outlet to view EOD reports.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">End-of-Day Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">Daily reconciliation and cash variance summary</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : closings.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">No daily closings found this month.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {closings.map((eod: any) => {
            const date = new Date(eod.business_date).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
            const dateSlug = new Date(eod.business_date).toISOString().slice(0, 10);
            const hasVariance = Math.abs(eod.variance ?? 0) > 0.01;
            return (
              <Link key={eod.id} href={`/${orgSlug}/reports/eod/${dateSlug}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-semibold">{date}</span>
                        </div>
                        <div className="flex items-center gap-2 pl-6">
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', STATUS_STYLES[eod.status] ?? STATUS_STYLES.open)}>
                            {eod.status}
                          </span>
                          {hasVariance && (
                            <span className={cn('text-xs font-medium', eod.variance < 0 ? 'text-red-600' : 'text-green-600')}>
                              Variance: KES {Math.abs(eod.variance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm font-bold">{eod.total_orders ?? 0}</p>
                          <p className="text-xs text-muted-foreground">Orders</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">KES {(eod.total_sales ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                          <p className="text-xs text-muted-foreground">Total Sales</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function EODListPage() {
  return (
    <ModuleGate moduleKey="pos.reports" fallback={<ModuleUnavailablePage />}>
      <EODContent />
    </ModuleGate>
  );
}
