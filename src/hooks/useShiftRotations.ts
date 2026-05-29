'use client';

import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { shiftRotationsApi, type CreateRotationInput, type RotationSlotInput, type ShiftRotation, type ShiftRotationSlot } from '@/lib/api/shift-rotations';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

export function useShiftRotations(activeOnly = false) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['shift-rotations', tenantID, activeOnly],
    queryFn: () => shiftRotationsApi.list(tenantID, activeOnly),
    enabled: !!tenantID,
    staleTime: 60_000,
  });
}

export function useShiftRotationDetail(rotationId: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['shift-rotation', tenantID, rotationId],
    queryFn: () => shiftRotationsApi.get(tenantID, rotationId),
    enabled: !!tenantID && !!rotationId,
    staleTime: 60_000,
  });
}

export function useCreateShiftRotation() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRotationInput) => shiftRotationsApi.create(tenantID, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-rotations', tenantID] }),
  });
}

export function useUpdateShiftRotation(rotationId: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; is_active?: boolean }) => shiftRotationsApi.update(tenantID, rotationId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-rotations', tenantID] });
      qc.invalidateQueries({ queryKey: ['shift-rotation', tenantID, rotationId] });
    },
  });
}

/** Fetches ALL active rotations and their slots; merges into a week-slot map. */
export function useAllActiveRotationDetails() {
  const tenantID = useTenantID();
  const { data: rotations = [] } = useShiftRotations(true);

  const results = useQueries({
    queries: rotations.map((r) => ({
      queryKey: ['shift-rotation', tenantID, r.id],
      queryFn: () => shiftRotationsApi.get(tenantID, r.id),
      enabled: !!tenantID && !!r.id,
      staleTime: 60_000,
    })),
  });

  return {
    rotationsWithSlots: rotations.map((rotation: ShiftRotation, i: number) => ({
      rotation,
      slots: (results[i]?.data?.slots ?? []) as ShiftRotationSlot[],
    })),
    activeRotations: rotations,
    isLoading: results.some((r) => r.isLoading),
  };
}

export function useUpsertRotationSlots(rotationId: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slots: RotationSlotInput[]) => shiftRotationsApi.upsertSlots(tenantID, rotationId, slots),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-rotation', tenantID, rotationId] }),
  });
}
