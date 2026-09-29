'use client';

import { ArrowRight, CalendarClock, CheckCircle2, FileText, Link2, Loader2, Palette } from 'lucide-react';

import { useUpdateJob } from '@/hooks/useServiceJobs';
import {
  nextStage,
  stageLabel,
  type JobHeader,
  type ProofStatus,
  type ServiceProfile,
} from '@/lib/api/service-jobs';
import { resolveMediaUrl } from '@/lib/screensaver';
import { cn } from '@/lib/utils';

const PROOF_LABELS: Record<ProofStatus, string> = {
  none: 'Not sent',
  sent: 'Sent to customer',
  approved: 'Approved',
  changes_requested: 'Changes requested',
};

const PROOF_TONE: Record<ProofStatus, string> = {
  none: 'bg-muted text-muted-foreground',
  sent: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  approved: 'bg-green-500/15 text-green-700 dark:text-green-300',
  changes_requested: 'bg-destructive/15 text-destructive',
};

/** True when the job is past its due time and not yet at its last stage. */
export function isJobOverdue(job: JobHeader | null | undefined, profile: ServiceProfile | null | undefined): boolean {
  if (!job?.due_at) return false;
  const last = profile?.stages?.[profile.stages.length - 1]?.key;
  if (last && job.stage === last) return false;
  return new Date(job.due_at).getTime() < Date.now();
}

/**
 * The job header plus its production controls: current stage with a one-tap "move to next stage",
 * a stage picker, the customer sign-off (proof / estimate / fitting) and the reference media.
 * Shared by the production board card and the job detail on the Orders page so both move a job
 * through the same pos-api endpoint (PATCH /orders/{id}/job).
 */
export function JobStageControl({
  orderId,
  job,
  profile,
  compact = false,
  readOnly = false,
}: {
  orderId: string;
  job: JobHeader | null | undefined;
  profile: ServiceProfile | null | undefined;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const update = useUpdateJob();
  if (!job) return null;
  const stages = profile?.stages ?? [];
  const next = nextStage(profile, job.stage);
  const proof = (job.proof_status ?? 'none') as ProofStatus;
  const overdue = isJobOverdue(job, profile);
  const busy = update.isPending;

  const set = (input: Parameters<typeof update.mutate>[0]['input']) => update.mutate({ orderId, input });

  return (
    <div className={cn('space-y-2 text-xs', compact && 'space-y-1.5')}>
      <div className="flex flex-wrap items-center gap-1.5">
        {job.stage && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{stageLabel(profile, job.stage)}</span>
        )}
        {job.due_at && (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5', overdue ? 'bg-destructive/15 text-destructive font-semibold' : 'bg-muted text-muted-foreground')}>
            <CalendarClock className="h-3 w-3" />
            {overdue ? 'Overdue ' : 'Due '}
            {new Date(job.due_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        )}
        {profile?.proof_label && (
          <span className={cn('rounded-full px-2 py-0.5', PROOF_TONE[proof])}>{profile.proof_label}: {PROOF_LABELS[proof]}</span>
        )}
        {job.design_from_scratch && (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-violet-700 dark:text-violet-300">
            <Palette className="h-3 w-3" /> Design from scratch
          </span>
        )}
        {job.collected_at && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-green-700 dark:text-green-300">
            <CheckCircle2 className="h-3 w-3" /> Collected
          </span>
        )}
      </div>

      {job.brief && <p className={cn('whitespace-pre-wrap rounded-md bg-muted/40 px-2 py-1', compact && 'line-clamp-3')}>{job.brief}</p>}

      {(job.attachments?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {job.attachments!.map((a, i) => (
            <a
              key={`${a.url}-${i}`}
              href={resolveMediaUrl(a.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-border px-2 py-0.5 text-primary hover:bg-accent"
            >
              {a.kind === 'link' ? <Link2 className="h-3 w-3 shrink-0" /> : <FileText className="h-3 w-3 shrink-0" />}
              <span className="truncate">{a.label || (a.kind === 'link' ? 'Link' : 'File')}</span>
            </a>
          ))}
        </div>
      )}

      {!readOnly && !job.collected_at && (
        <div className="flex flex-wrap items-center gap-1.5">
          {next && (
            <button
              type="button"
              disabled={busy}
              onClick={() => set({ stage: next.key })}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />} {next.label}
            </button>
          )}
          {stages.length > 1 && (
            <select
              aria-label="Move to stage"
              disabled={busy}
              value={job.stage ?? ''}
              onChange={(e) => e.target.value && set({ stage: e.target.value })}
              className="h-7 rounded-md border border-input bg-background px-1.5"
            >
              {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          )}
          {profile?.proof_label && proof !== 'approved' && (
            <>
              {proof !== 'sent' && (
                <button type="button" disabled={busy} onClick={() => set({ proof_status: 'sent' })}
                  className="rounded-md border border-border px-2 py-1 hover:bg-accent disabled:opacity-50">
                  {profile.proof_label} sent
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => set({ proof_status: 'approved' })}
                className="rounded-md border border-green-500/40 px-2 py-1 text-green-700 hover:bg-green-500/10 disabled:opacity-50 dark:text-green-300">
                Approved
              </button>
              <button type="button" disabled={busy} onClick={() => set({ proof_status: 'changes_requested' })}
                className="rounded-md border border-destructive/40 px-2 py-1 text-destructive hover:bg-destructive/10 disabled:opacity-50">
                Changes
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
