import { apiClient } from './client';
import type { ClientTrail } from '@/lib/client-trail';

export interface AuditLogEntry {
  id: string;
  outlet_id?: string;
  actor_user_id: string;
  actor_name?: string;
  approver_user_id?: string;
  approver_name?: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  /** Human reference for the entity, e.g. "Order 002384" or "Return R-0007 · Order 001990". */
  entity_label?: string;
  order_id?: string;
  reason?: string;
  amount?: number;
  before_json?: Record<string, unknown>;
  after_json?: Record<string, unknown>;
  /** Device, browser and IP the action came from (absent on entries before 2026-10-23). */
  client?: ClientTrail;
  created_at: string;
}

export interface ExceptionDevice {
  label: string;
  client_id?: string;
  ip?: string;
  device_kind?: string;
  sign_ins: number;
  last_at: string;
}

export interface ExceptionAgg {
  actor_user_id: string;
  actor_name?: string;
  counts: Record<string, number>;
  amounts: Record<string, number>;
  total: number;
  sign_ins: number;
  device_count: number;
  ip_count: number;
  devices: ExceptionDevice[];
}

export interface AuditFilters {
  /** One action code or a comma-separated list. */
  action?: string;
  actor?: string;
  outlet?: string;
  from?: string;
  to?: string;
  /** A browser's client id. */
  client?: string;
  ip?: string;
  /** An order number: the order's own entries plus its lines'. */
  order?: string;
  limit?: number;
  offset?: number;
}

const base = (tenantId: string) => `/api/v1/${tenantId}/pos`;

function qs(filters: Record<string, unknown>): string {
  const p = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const auditApi = {
  list: (tenantId: string, filters: AuditFilters = {}) =>
    apiClient.get<{ data: AuditLogEntry[]; total: number }>(`${base(tenantId)}/reports/audit-logs${qs(filters as Record<string, unknown>)}`),

  /** Without a from date the server defaults to the last 30 days (returned as `from`). */
  exceptions: (tenantId: string, filters: Pick<AuditFilters, 'outlet' | 'from' | 'to'> = {}) =>
    apiClient.get<{ data: ExceptionAgg[]; from?: string }>(`${base(tenantId)}/reports/exceptions${qs(filters as Record<string, unknown>)}`),
};
