'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { shiftsApi } from '@/lib/api/shifts';

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
    retry: (count, err: any) => err?.status !== 404 && count < 2,
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
