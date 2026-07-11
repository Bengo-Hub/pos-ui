'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { shiftsApi, type SessionSummary, type ShiftHistoryParams } from '@/lib/api/shifts';
import { getSnapshot, cacheSnapshot } from '@/lib/db/pos-db';
import { isEffectivelyOnline, isNetworkShapedError } from '@/lib/connectivity';

function useTenantId() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

export function useCurrentShift() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['shift-current', tenantId],
    // Offline (incl. cold-start and weak-wifi "effectively offline"): serve the last-known
    // shift snapshot so the gate resolves to the cashier's open shift instead of blocking;
    // cache it through on every online read. Network-shaped failures also fall back.
    queryFn: async () => {
      if (!isEffectivelyOnline()) {
        const snap = await getSnapshot(`shift:${tenantId}`);
        if (snap !== undefined) return snap;
      }
      try {
        const res = await shiftsApi.getCurrent(tenantId);
        await cacheSnapshot(`shift:${tenantId}`, tenantId, res).catch(() => {});
        return res;
      } catch (err) {
        if (isNetworkShapedError(err)) {
          const snap = await getSnapshot(`shift:${tenantId}`);
          if (snap !== undefined) return snap;
        }
        throw err;
      }
    },
    enabled: !!tenantId,
    staleTime: 30_000,
    networkMode: 'always',
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
    refetchInterval: 30_000,
    retry: (count, err: any) => err?.response?.status !== 404 && count < 2,
  });
}

export function useShiftHistory(params?: ShiftHistoryParams) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['shift-history', tenantId, params],
    queryFn: () => shiftsApi.getHistory(tenantId, params),
    enabled: !!tenantId,
    staleTime: 60_000,
    placeholderData: (prev) => prev, // keep the current page visible while the next loads
  });
}

export function useOpenShift() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opening_float: number) => shiftsApi.open(tenantId, opening_float),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-current', tenantId] });
      qc.invalidateQueries({ queryKey: ['shift-summary', tenantId] });
    },
  });
}

export function useCloseShift() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { closing_float: number; notes?: string }) =>
      shiftsApi.close(tenantId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-current', tenantId] });
      qc.invalidateQueries({ queryKey: ['shift-summary', tenantId] });
      qc.invalidateQueries({ queryKey: ['shift-history', tenantId] });
    },
  });
}
