import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { staffApi, type CreateStaffInput, type UpdateStaffInput } from '@/lib/api/staff';

export function useStaffList(tenantId: string, outletId?: string) {
  return useQuery({
    queryKey: ['staff', tenantId, outletId],
    queryFn: () => staffApi.list(tenantId, outletId),
    enabled: !!tenantId,
  });
}

export function useStaffAdmin(tenantId: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['staff-admin', tenantId],
    queryFn: () => staffApi.listAdmin(tenantId),
    enabled: !!tenantId && (opts?.enabled ?? true),
    staleTime: 30_000,
  });
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
