'use client';

/**
 * TeamOnShiftPanel — manager/admin view of which staff are CURRENTLY on shift (an open
 * session), plus everyone who has clocked in/out today, so a manager can actually see who's
 * working right now instead of only their own "My Shift" status. Reuses the existing
 * shift-report data (same source the Reports > Shifts page and the dashboard's "Active Staff"
 * count already draw from) — no new backend endpoint needed.
 */

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Clock, Loader2, RefreshCw, ShoppingCart, Wallet, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/base';
import { useShiftReport } from '@/hooks/useReports';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { formatCurrency } from '@/lib/utils';

function ymdLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function elapsedSince(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

export function TeamOnShiftPanel() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [refreshTick, setRefreshTick] = useState(0);
  const today = ymdLocal(new Date());
  const { data: rows = [], isLoading, refetch, isFetching } = useShiftReport(today, today);
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';

  const { onShift, closedToday } = useMemo(() => {
    const on: typeof rows = [];
    const closed: typeof rows = [];
    for (const r of rows) {
      (r.closed_at ? closed : on).push(r);
    }
    on.sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());
    closed.sort((a, b) => new Date(b.closed_at ?? 0).getTime() - new Date(a.closed_at ?? 0).getTime());
    return { onShift: on, closedToday: closed };
  }, [rows]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
            On Shift Now ({onShift.length})
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Staff with an open shift session right now.</p>
        </div>
        <button
          onClick={() => { setRefreshTick((t) => t + 1); void refetch(); }}
          className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {onShift.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">No one is currently on shift.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {onShift.map((r) => (
            <Card key={r.shift_id} className="border-green-200 dark:border-green-900">
              <CardContent className="p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{r.cashier_name || 'Unknown staff'}</p>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-500/10 text-green-700 shrink-0">
                    Open
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Since {new Date(r.opened_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                    {' · '}
                    <span key={refreshTick}>{elapsedSince(r.opened_at)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-semibold">{r.order_count}</span>
                    <span className="text-muted-foreground">orders</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-semibold">{formatCurrency(r.total_revenue, currency)}</span>
                  </div>
                </div>
                <Link
                  href={`/${orgSlug}/reports/shifts/${r.shift_id}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  View details <ExternalLink className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="pt-2">
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">Closed today ({closedToday.length})</h3>
        {closedToday.length === 0 ? (
          <p className="text-sm text-muted-foreground">No closed shifts yet today.</p>
        ) : (
          <div className="space-y-1.5">
            {closedToday.map((r) => (
              <Link
                key={r.shift_id}
                href={`/${orgSlug}/reports/shifts/${r.shift_id}`}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm"
              >
                <span className="font-medium truncate">{r.cashier_name || 'Unknown staff'}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(r.opened_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {r.closed_at ? new Date(r.closed_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
                <span className="text-xs font-semibold shrink-0">{formatCurrency(r.total_revenue, currency)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        For per-cashier expected-cash and blind-close review, use{' '}
        <Link href={`/${orgSlug}/reports/shifts`} className="text-primary hover:underline">Reports → Shift Reports</Link>.
      </p>
    </div>
  );
}
