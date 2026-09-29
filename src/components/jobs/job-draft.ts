import type { JobAttachment } from '@/lib/api/service-jobs';

/** The job header being captured at reception before the job order is created. */
export interface JobDraft {
  /** datetime-local value (local time, no zone); empty when no due date was set. */
  dueAt: string;
  brief: string;
  designFromScratch: boolean;
  attachments: JobAttachment[];
}

export const emptyJobDraft = (): JobDraft => ({ dueAt: '', brief: '', designFromScratch: false, attachments: [] });

/** order.metadata.job payload for CreateOrder. pos-api validates and normalizes it
 *  (orders.NormalizeNewJob), stamping the profile's first stage and the stage history. */
export function jobDraftToMetadata(d: JobDraft): Record<string, unknown> {
  const job: Record<string, unknown> = {};
  if (d.dueAt) {
    const due = new Date(d.dueAt);
    if (!Number.isNaN(due.getTime())) job.due_at = due.toISOString();
  }
  if (d.brief.trim()) job.brief = d.brief.trim();
  if (d.designFromScratch) job.design_from_scratch = true;
  if (d.attachments.length > 0) job.attachments = d.attachments;
  return job;
}

/** Specs keep only filled values so an empty form never reaches the ticket. */
export function cleanSpecs(specs: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!specs) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(specs)) {
    if (v != null && String(v).trim() !== '') out[k] = String(v).trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
