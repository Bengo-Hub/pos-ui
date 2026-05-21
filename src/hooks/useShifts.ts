'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { shiftsApi, type SessionSummary } from '@/lib/api/shifts';

function useTenantId() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

export function useCurrentShift() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['shift-current', tenantId],
    queryFn: () => shiftsApi.getCurrent(tenantId),
    enabled: !!tenantId,
    staleTime: 30_000,
    retry: (count, err: any) => err?.response?.status !== 404 && count < 2,
  });
}

export function useSessionSummary(enabled: boolean) {
  const tenantId = useTenantId();
  return useQuery<SessionSummary | null>({
    queryKey: ['shift-summary', tenantId],
    queryFn: () => shiftsApi.getSummary(tenantId),
    enabled: !!tenantId && enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: (count, err: any) => err?.response?.status !== 404 && count < 2,
  });
}

export function useOpenShift() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opening_float: number) => shiftsApi.open(tenantId, opening_float),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-current', tenantId] }),
  });
}

export function useCloseShift() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (closing_float: number) => shiftsApi.close(tenantId, closing_float),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-current', tenantId] }),
  });
}
