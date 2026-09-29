'use client';

import { AlertTriangle, BarChart3, CalendarClock, ClipboardList, Coins, PackageCheck, Plus, RefreshCw, Wallet } from 'lucide-react';

import { DashboardCharts } from './role-dashboards';
import { DashboardRangeFilter, useDashboardRange } from './range-filter';
import { KPICard, QuickActionGrid, QuickActionTile, RecentOrdersCard, fmt, fmtNum, useDashboardSummary } from './widgets';
import { useJobSummary, useOutletServiceProfile } from '@/hooks/useServiceJobs';
import { cn } from '@/lib/utils';

/**
 * Admin/manager dashboard for a job-workflow services outlet (printing, garage, laundry,
 * tailoring): the job book first (in production, ready for collection, due today, overdue,
 * waiting on the customer's proof), the money on unfinished jobs (deposits held, balance still to
 * collect), then the same sales KPIs and charts every outlet gets.
 */
export function JobsDashboard({ orgSlug }: { orgSlug: string }) {
  const { profile } = useOutletServiceProfile();
  const { range, preset, setPreset, custom, setCustom } = useDashboardRange();
  const { data: summary, isLoading, refetch, isFetching } = useDashboardSummary(range);
  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs } = useJobSummary();
  const s = summary ?? {};
  const label = profile?.job_label ?? 'Job';
  const plural = `${label}s`;

  return (
    <div className="space-y-6 overflow-x-hidden p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">{profile?.label ?? 'Services'} Overview</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <DashboardRangeFilter preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} />
          <button
            onClick={() => { refetch(); refetchJobs(); }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border transition-colors hover:bg-accent"
            aria-label="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4 text-muted-foreground', isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="In Production" value={fmtNum(jobs?.in_production ?? 0)} sub={`${fmtNum(jobs?.awaiting_proof ?? 0)} waiting on the customer`} icon={ClipboardList} loading={jobsLoading} />
        <KPICard label="Ready for Collection" value={fmtNum(jobs?.ready_for_collection ?? 0)} sub="finished, not yet collected" icon={PackageCheck} loading={jobsLoading} />
        <KPICard label="Due Today" value={fmtNum(jobs?.due_today ?? 0)} sub={`${plural.toLowerCase()} promised today`} icon={CalendarClock} loading={jobsLoading} />
        <KPICard label="Overdue" value={fmtNum(jobs?.overdue ?? 0)} sub="past the promised time" icon={AlertTriangle} loading={jobsLoading} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="Deposits Held" value={fmt(jobs?.deposits_held ?? 0, s.currency)} sub="on unfinished jobs" icon={Wallet} loading={jobsLoading} />
        <KPICard label="Balance to Collect" value={fmt(jobs?.balance_outstanding ?? 0, s.currency)} sub="paid at collection" icon={Coins} loading={jobsLoading} />
        <KPICard label="Revenue" value={fmt(s.total_revenue ?? 0, s.currency)} sub={range.compareLabel} icon={BarChart3} trend={s.revenue_growth} loading={isLoading} />
        <KPICard label="Gross Profit" value={fmt(s.gross_profit ?? 0, s.currency)} sub={`${(s.gross_margin_pct ?? 0).toFixed(1)}% margin`} icon={Coins} trend={s.gross_profit_growth} loading={isLoading} />
      </div>

      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quick Actions</p>
        <QuickActionGrid>
          <QuickActionTile icon={Plus} label={`New ${label}`} href={`/${orgSlug}/order`} accent />
          <QuickActionTile icon={ClipboardList} label="Production Board" href={`/${orgSlug}/production`} tint="blue" />
          <QuickActionTile icon={PackageCheck} label="Collect & Pay" href={`/${orgSlug}/orders`} tint="emerald" />
          <QuickActionTile icon={BarChart3} label="Reports" href={`/${orgSlug}/reports`} tint="emerald" />
        </QuickActionGrid>
      </div>

      <DashboardCharts range={range} currency={s.currency} />
      <RecentOrdersCard orgSlug={orgSlug} />
    </div>
  );
}
