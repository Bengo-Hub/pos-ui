'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Printer } from 'lucide-react';

import { JobStageControl } from '@/components/jobs/job-stage-control';
import { printJobTicket, type JobTicketOrder } from '@/components/jobs/job-ticket';
import { useOutletServiceProfile, useUpdateJob } from '@/hooks/useServiceJobs';
import { jobHeaderOf } from '@/lib/api/service-jobs';
import { formatCurrency } from '@/lib/utils';
import { useTenantBranding } from '@/providers/tenant-branding-provider';

/**
 * Job section of an order's detail on the Orders page: stage and proof controls, the payment
 * position (deposit paid, balance at collection), the job ticket reprint, and "Collected" once
 * the customer has picked up a fully paid job. Renders nothing for a non-job order.
 */
export function OrderJobPanel({ order }: { order: JobTicketOrder & { id: string; status: string; order_subtype?: string } }) {
  const { profile } = useOutletServiceProfile();
  const { tenant } = useTenantBranding();
  const update = useUpdateJob();
  const [printing, setPrinting] = useState(false);
  const job = jobHeaderOf(order);
  if (order.order_subtype !== 'service_job' || !job) return null;

  const currency = order.currency || 'KES';
  const total = order.total_amount ?? 0;
  const paid = order.paid_total ?? 0;
  const balance = Math.max(0, total - paid);
  const canCollect = order.status === 'completed' && !job.collected_at;

  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-primary">{profile?.job_label ?? 'Job'}</p>
      <JobStageControl orderId={order.id} job={job} profile={profile} readOnly={['cancelled', 'voided', 'refunded'].includes(order.status)} />
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div><p className="text-muted-foreground">Total</p><p className="font-bold tabular-nums">{formatCurrency(total, currency)}</p></div>
        <div><p className="text-muted-foreground">Paid</p><p className="font-bold tabular-nums text-green-600">{formatCurrency(paid, currency)}</p></div>
        <div><p className="text-muted-foreground">Balance</p><p className="font-bold tabular-nums">{formatCurrency(balance, currency)}</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { setPrinting(true); try { printJobTicket(order, profile, tenant?.orgName || tenant?.name); } finally { setPrinting(false); } }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent"
        >
          {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />} Job ticket
        </button>
        {canCollect && (
          <button
            type="button"
            disabled={update.isPending}
            onClick={() => update.mutate({ orderId: order.id, input: { collected: true } })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-50"
          >
            {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Mark collected
          </button>
        )}
      </div>
    </div>
  );
}
