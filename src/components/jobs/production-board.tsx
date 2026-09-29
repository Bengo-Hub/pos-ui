'use client';

import { useMemo, useState } from 'react';
import { ClipboardList, Loader2, Phone, Search, Wifi } from 'lucide-react';

import { isJobOverdue, JobStageControl } from '@/components/jobs/job-stage-control';
import { useKDSTickets, type KDSTicket } from '@/hooks/useKDS';
import { usePermissions, P } from '@/hooks/usePermissions';
import { useOutletServiceProfile } from '@/hooks/useServiceJobs';
import { stageLabel, type ServiceProfile } from '@/lib/api/service-jobs';
import { cn, formatCurrency } from '@/lib/utils';

/** One job on the board: its production tickets across stations, merged into a single card. */
interface BoardJob {
  orderId: string;
  orderNumber: string;
  receivedAt: string;
  tickets: KDSTicket[];
  job: NonNullable<KDSTicket['job']>;
}

function groupJobs(tickets: KDSTicket[]): BoardJob[] {
  const byOrder = new Map<string, BoardJob>();
  for (const t of tickets) {
    if (!t.job) continue;
    const existing = byOrder.get(t.order_id);
    if (existing) {
      existing.tickets.push(t);
      continue;
    }
    byOrder.set(t.order_id, {
      orderId: t.order_id,
      orderNumber: t.order_number,
      receivedAt: t.received_at,
      tickets: [t],
      job: t.job,
    });
  }
  return [...byOrder.values()];
}

/** Sort: overdue first, then by due date, then oldest received. */
function sortJobs(jobs: BoardJob[], profile: ServiceProfile | null): BoardJob[] {
  return [...jobs].sort((a, b) => {
    const ao = isJobOverdue(a.job.details, profile) ? 0 : 1;
    const bo = isJobOverdue(b.job.details, profile) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const ad = a.job.details?.due_at ? new Date(a.job.details.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b.job.details?.due_at ? new Date(b.job.details.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (ad !== bd) return ad - bd;
    return new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime();
  });
}

function JobCard({ item, profile }: { item: BoardJob; profile: ServiceProfile | null }) {
  const { can } = usePermissions();
  const canChange = can(P.KDS_CHANGE);
  const details = item.job.details;
  const balance = Math.max(0, item.job.total_amount - item.job.paid_total);
  const specLabels = new Map((profile?.spec_fields ?? []).map((f) => [f.key, f.label]));
  const overdue = isJobOverdue(details, profile);

  return (
    <div className={cn('rounded-xl border bg-card p-3 shadow-sm space-y-2', overdue ? 'border-destructive/60' : 'border-border')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold">#{item.orderNumber}</p>
          {(item.job.customer_name || item.job.customer_phone) && (
            <p className="truncate text-xs text-muted-foreground">
              {item.job.customer_name}
              {item.job.customer_phone && (
                <a href={`tel:${item.job.customer_phone}`} className="ml-1 inline-flex items-center gap-0.5 text-primary">
                  <Phone className="h-3 w-3" />{item.job.customer_phone}
                </a>
              )}
            </p>
          )}
        </div>
        <div className="text-right text-[11px]">
          <p className="font-semibold tabular-nums">{formatCurrency(item.job.total_amount, 'KES')}</p>
          <p className={cn('tabular-nums', balance > 0 ? 'text-amber-600' : 'text-green-600')}>
            {balance > 0 ? `Due ${formatCurrency(balance, 'KES')}` : 'Paid'}
          </p>
        </div>
      </div>

      <ul className="space-y-1 border-t border-border pt-2">
        {item.tickets.flatMap((t) => t.items).map((it, i) => (
          <li key={`${it.line_id}-${i}`} className="text-xs">
            <span className="font-semibold">{it.quantity ?? it.qty ?? 1} × {it.name}</span>
            {it.job_specs && Object.keys(it.job_specs).length > 0 && (
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {Object.entries(it.job_specs).map(([k, v]) => `${specLabels.get(k) ?? k}: ${v}`).join(' · ')}
              </span>
            )}
            {it.notes && <span className="block text-[11px] font-semibold text-amber-600">{it.notes}</span>}
          </li>
        ))}
      </ul>

      <JobStageControl orderId={item.orderId} job={details} profile={profile} compact readOnly={!canChange} />
    </div>
  );
}

/**
 * Production board for job-workflow services outlets (printing, garage, laundry, tailoring):
 * one column per production stage of the outlet's service profile, one card per job. Jobs move
 * through the stages from here; reaching the last stage hands the job to the cashier for payment
 * and collection. Backed by the same pos-api KDS tickets a kitchen display uses, with no
 * recency cut-off because jobs run for days.
 */
export function ProductionBoard() {
  const { profile, loading } = useOutletServiceProfile();
  const [search, setSearch] = useState('');
  const { data, isLoading } = useKDSTickets({ sinceHours: 0 });
  const tickets = data?.data ?? [];

  const jobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = groupJobs(tickets);
    const filtered = q
      ? all.filter((j) =>
          j.orderNumber.toLowerCase().includes(q) ||
          (j.job.customer_name ?? '').toLowerCase().includes(q) ||
          (j.job.customer_phone ?? '').includes(q))
      : all;
    return sortJobs(filtered, profile);
  }, [tickets, search, profile]);

  const stages = profile?.stages ?? [];
  const columns = stages.length > 0
    ? stages.map((s) => ({ key: s.key, label: s.label, jobs: jobs.filter((j) => (j.job.details?.stage ?? stages[0].key) === s.key) }))
    : [{ key: 'all', label: 'In production', jobs }];
  const overdueCount = jobs.filter((j) => isJobOverdue(j.job.details, profile)).length;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="shrink-0 space-y-3 border-b border-border px-4 pb-3 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-6 w-6 text-primary" />
            <div>
              <h1 className="font-display text-xl font-bold">Production Board</h1>
              <p className="text-xs text-muted-foreground">
                {profile?.label ?? 'Services'} · {jobs.length} active {jobs.length === 1 ? 'job' : 'jobs'}
                {overdueCount > 0 && <span className="font-semibold text-destructive"> · {overdueCount} overdue</span>}
              </p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600">
              <Wifi className="h-3 w-3" /> Live
            </span>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Job #, customer or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {isLoading || loading ? (
        <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="flex-1 overflow-x-auto p-4 sm:p-6">
          <div className="grid auto-cols-[minmax(17rem,1fr)] grid-flow-col gap-4">
            {columns.map((col) => (
              <section key={col.key} className="flex min-h-[60vh] flex-col rounded-2xl bg-muted/30 p-2">
                <header className="flex items-center justify-between px-2 py-1.5">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{col.label}</h2>
                  <span className="rounded-full bg-card px-2 text-[11px] font-bold">{col.jobs.length}</span>
                </header>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {col.jobs.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">No jobs at {stageLabel(profile, col.key).toLowerCase() || 'this stage'}</p>
                  ) : (
                    col.jobs.map((j) => <JobCard key={j.orderId} item={j} profile={profile} />)
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
