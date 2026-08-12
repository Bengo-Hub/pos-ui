import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { staffApi, type CreateStaffInput, type UpdateStaffInput } from '@/lib/api/staff';
import type { ComboboxOption } from '@bengo-hub/shared-ui-lib/combobox';

export function useStaffList(tenantId: string, outletId?: string) {
  return useQuery({
    queryKey: ['staff', tenantId, outletId],
    queryFn: () => staffApi.list(tenantId, outletId),
    enabled: !!tenantId,
  });
}

export function useStaffAdmin(tenantId: string, opts?: { enabled?: boolean; search?: string }) {
  return useQuery({
    queryKey: ['staff-admin', tenantId, opts?.search ?? ''],
    queryFn: () => staffApi.listAdmin(tenantId, opts?.search),
    enabled: !!tenantId && (opts?.enabled ?? true),
    staleTime: 30_000,
  });
}

/**
 * Stable `onRemoteSearch` callback for any staff-assignment combobox (layaway party,
 * shift-rotation slot, staff-credit sale) — GET /pos/staff/admin?search=…, the same
 * endpoint `useStaffAdmin` prefetches page 1 of, so a staff member sorting past that
 * first page (default limit 20) is still found once typed.
 */
export function useStaffSearch(tenantId: string): (query: string) => Promise<ComboboxOption[]> {
  return useCallback(
    async (query: string) => {
      const res = await staffApi.listAdmin(tenantId, query);
      return res.data.map((s) => ({ value: s.id, label: s.name, hint: s.role || undefined }));
    },
    [tenantId],
  );
}

export function useCreateStaff(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStaffInput) => staffApi.create(tenantId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-admin', tenantId] });
      qc.invalidateQueries({ queryKey: ['staff', tenantId] });
    },
  });
}

export function useUpdateStaff(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ staffId, input }: { staffId: string; input: UpdateStaffInput }) =>
      staffApi.update(tenantId, staffId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-admin', tenantId] });
    },
  });
}

export function useDeactivateStaff(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (staffId: string) => staffApi.deactivate(tenantId, staffId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-admin', tenantId] });
    },
  });
}

export function useSetStaffPIN(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, pin }: { userId: string; pin: string }) =>
      staffApi.setPin(tenantId, userId, pin),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff', tenantId] });
      qc.invalidateQueries({ queryKey: ['staff-admin', tenantId] });
    },
  });
}
