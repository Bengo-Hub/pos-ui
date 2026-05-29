'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { shiftOverridesApi, type CreateOverrideInput } from '@/lib/api/shift-overrides';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

/** All staff overrides for the current week (used by planner panel) */
export function useAllShiftOverrides(from: string, to: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['shift-overrides-all', tenantID, from, to],
    queryFn: () => shiftOverridesApi.listAll(tenantID, from, to),
    enabled: !!tenantID && !!from && !!to,
    staleTime: 30_000,
  });
}

/** Overrides for a specific staff member */
export function useStaffOverrides(staffId: string, from: string, to: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['shift-overrides', tenantID, staffId, from, to],
    queryFn: () => shiftOverridesApi.listForStaff(tenantID, staffId, from, to),
    enabled: !!tenantID && !!staffId && !!from && !!to,
    staleTime: 30_000,
  });
}

export function useCreateShiftOverride(staffId: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOverrideInput) => shiftOverridesApi.create(tenantID, staffId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-overrides-all', tenantID] });
      qc.invalidateQueries({ queryKey: ['shift-overrides', tenantID, staffId] });
    },
  });
}

export function useDeleteShiftOverride(staffId: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (overrideId: string) => shiftOverridesApi.delete(tenantID, staffId, overrideId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-overrides-all', tenantID] });
      qc.invalidateQueries({ queryKey: ['shift-overrides', tenantID, staffId] });
    },
  });
}
