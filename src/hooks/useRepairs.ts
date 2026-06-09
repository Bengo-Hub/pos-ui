'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import {
  repairsApi,
  type RepairStatus,
  type CreateRepairInput,
  type UpdateRepairInput,
  type AddPartInput,
} from '@/lib/api/repairs';

export type {
  RepairJob,
  RepairJobPart,
  RepairJobEvent,
  RepairJobDetail,
  RepairStatus,
  CreateRepairInput,
  UpdateRepairInput,
  AddPartInput,
} from '@/lib/api/repairs';
export { REPAIR_STATUSES, REPAIR_STATUS_LABELS } from '@/lib/api/repairs';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

/** List repair jobs, optionally filtered by status. */
export function useRepairs(status?: RepairStatus) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-repairs', tenantID, status ?? 'all'],
    queryFn: () => repairsApi.list(tenantID, status),
    enabled: !!tenantID,
    staleTime: 15_000,
  });
}

/** Fetch a single repair job with its parts + timeline. */
export function useRepair(jobID: string | null) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-repair', tenantID, jobID],
    queryFn: () => repairsApi.get(tenantID, jobID!),
    enabled: !!tenantID && !!jobID,
    staleTime: 10_000,
  });
}

export function useCreateRepair() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRepairInput) => repairsApi.create(tenantID, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-repairs', tenantID] }),
  });
}

export function useUpdateRepair() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobID, input }: { jobID: string; input: UpdateRepairInput }) =>
      repairsApi.update(tenantID, jobID, input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['pos-repairs', tenantID] });
      qc.invalidateQueries({ queryKey: ['pos-repair', tenantID, vars.jobID] });
    },
  });
}

export function useAddRepairPart() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobID, input }: { jobID: string; input: AddPartInput }) =>
      repairsApi.addPart(tenantID, jobID, input),
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['pos-repair', tenantID, vars.jobID] }),
  });
}

export function useRemoveRepairPart() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobID, partID }: { jobID: string; partID: string }) =>
      repairsApi.removePart(tenantID, jobID, partID),
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['pos-repair', tenantID, vars.jobID] }),
  });
}

export function useSettleRepair() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobID, posOrderID }: { jobID: string; posOrderID: string }) =>
      repairsApi.settle(tenantID, jobID, posOrderID),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['pos-repairs', tenantID] });
      qc.invalidateQueries({ queryKey: ['pos-repair', tenantID, vars.jobID] });
    },
  });
}
