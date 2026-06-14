'use client';

import { useQuery } from '@tanstack/react-query';
import { auditApi, type AuditFilters } from '@/lib/api/audit';

export function usePosAuditLogs(tenantId: string, filters: AuditFilters = {}) {
  return useQuery({
    queryKey: ['pos-audit-logs', tenantId, filters],
    queryFn: () => auditApi.list(tenantId, filters),
    enabled: !!tenantId,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function usePosExceptions(tenantId: string, filters: Pick<AuditFilters, 'outlet' | 'from' | 'to'> = {}) {
  return useQuery({
    queryKey: ['pos-exceptions', tenantId, filters],
    queryFn: () => auditApi.exceptions(tenantId, filters),
    enabled: !!tenantId,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}
