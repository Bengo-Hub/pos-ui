import { apiClient } from './client';

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
  reason?: string;
  amount?: number;
  created_at: string;
}

export interface ExceptionAgg {
  actor_user_id: string;
  actor_name?: string;
  counts: Record<string, number>;
  amounts: Record<string, number>;
  total: number;
}

export interface AuditFilters {
  action?: string;
  actor?: string;
  outlet?: string;
  from?: string;
  to?: string;
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

  exceptions: (tenantId: string, filters: Pick<AuditFilters, 'outlet' | 'from' | 'to'> = {}) =>
    apiClient.get<{ data: ExceptionAgg[] }>(`${base(tenantId)}/reports/exceptions${qs(filters as Record<string, unknown>)}`),
};
