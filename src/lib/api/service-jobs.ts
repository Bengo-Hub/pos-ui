import { apiClient } from '@/lib/api/client';

/**
 * Services sub use cases (printing, salon, garage, laundry, ...) and job orders.
 *
 * The profile registry is owned by pos-api (outletpolicy.ServiceProfiles) and fetched here, so the
 * terminal, settings and production board never keep their own copy. A job order is a normal POS
 * order with order_subtype "service_job"; its job header lives in order.metadata.job.
 */

export type ServiceWorkflow = 'job' | 'appointment' | 'queue';

export interface ServiceSpecField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'date';
  options?: string[];
  placeholder?: string;
  required?: boolean;
}

export interface ServiceJobStage {
  key: string;
  label: string;
}

export interface ServiceProfile {
  key: string;
  label: string;
  description: string;
  workflow: ServiceWorkflow;
  item_use_cases: string[] | null;
  sells_retail_goods: boolean;
  job_label: string;
  performer_label: string;
  proof_label?: string;
  stages?: ServiceJobStage[];
  spec_fields?: ServiceSpecField[];
  default_deposit_percent: number;
  accepts_attachments: boolean;
  design_from_scratch: boolean;
  /** Specialist staff roles of this trade (the PIN login lists these plus manager/cashier/receptionist). */
  staff_roles: string[];
  /** Sidebar modules this trade adds to the services base set (ModuleKey values). */
  modules: string[];
}

export interface JobAttachment {
  kind: 'link' | 'file';
  url: string;
  label?: string;
}

export type ProofStatus = 'none' | 'sent' | 'approved' | 'changes_requested';

/** order.metadata.job as stored by pos-api (orders.NormalizeNewJob / ApplyJobUpdate). */
export interface JobHeader {
  profile?: string;
  due_at?: string;
  brief?: string;
  design_from_scratch?: boolean;
  attachments?: JobAttachment[];
  stage?: string;
  proof_status?: ProofStatus;
  stage_history?: { stage: string; at: string; by?: string }[];
  collected_at?: string;
}

export interface JobUpdateInput {
  due_at?: string;
  brief?: string;
  design_from_scratch?: boolean;
  attachments?: JobAttachment[];
  stage?: string;
  proof_status?: ProofStatus;
  collected?: boolean;
}

/** Services jobs dashboard (pos-api orders.JobSummary) for the active outlet. */
export interface JobSummary {
  in_production: number;
  ready_for_collection: number;
  due_today: number;
  overdue: number;
  awaiting_proof: number;
  balance_outstanding: number;
  deposits_held: number;
}

/** Upload limits, mirrored from pos-api (orders.MaxJobFileAttachments, maxJobAttachmentBytes). */
export const MAX_JOB_FILES = 5;
export const MAX_JOB_LINKS = 10;
export const MAX_JOB_FILE_BYTES = 512 * 1024;
export const JOB_FILE_ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf';

const posBase = (tenantID: string) => `/api/v1/${tenantID}/pos`;

export const serviceJobsApi = {
  listProfiles: (tenantID: string) =>
    apiClient.get<{ data: ServiceProfile[] }>(`${posBase(tenantID)}/service-profiles`),

  updateJob: (tenantID: string, orderID: string, body: JobUpdateInput) =>
    apiClient.patch<{ order_id: string; job: JobHeader }>(`${posBase(tenantID)}/orders/${orderID}/job`, body),

  summary: (tenantID: string) =>
    apiClient.get<JobSummary>(`${posBase(tenantID)}/jobs/summary`),

  uploadAttachment: (tenantID: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post<{ url: string; label: string }>(`${posBase(tenantID)}/orders/job-attachments`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

/** Reads the job header off an order (tolerates orders without one). */
export function jobHeaderOf(order: { metadata?: Record<string, unknown> | null } | null | undefined): JobHeader | null {
  const job = order?.metadata?.job;
  return job && typeof job === 'object' ? (job as JobHeader) : null;
}

/** Stage label for a key, falling back to a title-cased key. */
export function stageLabel(profile: ServiceProfile | null | undefined, key?: string): string {
  if (!key) return '';
  const hit = profile?.stages?.find((s) => s.key === key);
  if (hit) return hit.label;
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Next stage after `key` in the profile pipeline, or undefined at the end. */
export function nextStage(profile: ServiceProfile | null | undefined, key?: string): ServiceJobStage | undefined {
  const stages = profile?.stages ?? [];
  const i = stages.findIndex((s) => s.key === key);
  return i >= 0 && i < stages.length - 1 ? stages[i + 1] : undefined;
}

/** Suggested deposit for a job total, rounded up to the nearest shilling. */
export function suggestedDeposit(total: number, percent: number): number {
  if (!(total > 0) || !(percent > 0)) return 0;
  return Math.min(total, Math.ceil((total * percent) / 100));
}

/** True when the URL is a plain http(s) link a customer can open. */
export function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
