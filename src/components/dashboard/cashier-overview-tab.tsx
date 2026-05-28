'use client';

import { useDashboardSummary, fmt, fmtNum, KPICard } from './widgets';
import { useCurrentDrawer, useShiftSummary } from '@/hooks/usePOS';
import { BarChart3, CreditCard, TrendingUp, Wallet } from 'lucide-react';

export function CashierOverviewTab() {
  const { data: summary, isLoading } = useDashboardSummary();
  const { data: drawerData } = useCurrentDrawer();
  const { data: shift } = useShiftSummary();
  const s = summary ?? {};
  const cashInDrawer = (drawerData?.drawer?.starting_cash ?? 0) + (shift?.cash_in_total ?? 0);

  const tenders = [
    { label: 'Cash', value: shift?.cash_in_total ?? 0, color: 'bg-emerald-500' },
    { label: 'Card', value: shift?.card_total ?? 0, color: 'bg-blue-500' },
    { label: 'M-Pesa', value: shift?.mpesa_total ?? 0, color: 'bg-green-500' },
  ];
  const tenderTotal = tenders.reduce((s, t) => s + t.value, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <KPICard label="Today's Revenue" value={fmt(s.total_revenue ?? 0)} sub="vs yesterday" icon={TrendingUp} trend={s.revenue_growth} loading={isLoading} />
        <KPICard label="Orders" value={fmtNum(s.total_orders ?? 0)} sub="today" icon={BarChart3} loading={isLoading} />
        <KPICard label="Avg Ticket" value={fmt(s.avg_ticket ?? 0)} sub="per order" icon={CreditCard} loading={isLoading} />
        <KPICard label="Cash in Drawer" value={fmt(cashInDrawer)} sub="opening + cash sales" icon={Wallet} />
      </div>

      {tenderTotal > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <p className="text-sm font-bold">Payment Breakdown</p>
          {tenders.filter((t) => t.value > 0).map((t) => (
            <div key={t.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t.label}</span>
                <span className="font-semibold">{fmt(t.value)}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${t.color}`}
                  style={{ width: `${tenderTotal > 0 ? Math.round((t.value / tenderTotal) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
