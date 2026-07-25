'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import {
  listPrescribers,
  createPatient,
  listPatients,
  getPatient,
  createVisit,
  listVisits,
  getVisit,
  recordTriage,
  recordExamination,
  prescribeFromExamination,
  listLabOrders,
  submitLabResults,
  type CreatePatientData,
  type CreateVisitData,
  type VisitStatus,
  type TriageInput,
  type ExaminationInput,
  type PrescribeInput,
  type LabResultLineInput,
} from '@/lib/api/clinical';

function useTenantSlug() {
  return useAuthStore((s) => s.user?.tenant_slug ?? '');
}

// ─── Prescribers ────────────────────────────────────────────────────────────────

export function usePrescribers() {
  const tenantSlug = useTenantSlug();
  return useQuery({
    queryKey: ['prescribers', tenantSlug],
    queryFn: () => listPrescribers(tenantSlug),
    enabled: !!tenantSlug,
    staleTime: 5 * 60_000,
  });
}

// ─── Patients ──────────────────────────────────────────────────────────────────

export function usePatients(q?: string) {
  const tenantSlug = useTenantSlug();
  return useQuery({
    queryKey: ['clinical-patients', tenantSlug, q],
    queryFn: () => listPatients(tenantSlug, q),
    enabled: !!tenantSlug,
    staleTime: 30_000,
  });
}

export function usePatient(id: string) {
  const tenantSlug = useTenantSlug();
  return useQuery({
    queryKey: ['clinical-patient', tenantSlug, id],
    queryFn: () => getPatient(tenantSlug, id),
    enabled: !!tenantSlug && !!id,
  });
}

export function useCreatePatient() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePatientData) => createPatient(tenantSlug, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinical-patients', tenantSlug] }),
  });
}

// ─── Visits ────────────────────────────────────────────────────────────────────

export function useVisits(status?: VisitStatus) {
  const tenantSlug = useTenantSlug();
  return useQuery({
    queryKey: ['clinical-visits', tenantSlug, status],
    queryFn: () => listVisits(tenantSlug, status),
    enabled: !!tenantSlug,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useVisit(id: string) {
  const tenantSlug = useTenantSlug();
  return useQuery({
    queryKey: ['clinical-visit', tenantSlug, id],
    queryFn: () => getVisit(tenantSlug, id),
    enabled: !!tenantSlug && !!id,
  });
}

export function useCreateVisit() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateVisitData) => createVisit(tenantSlug, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinical-visits', tenantSlug] }),
  });
}

// ─── Triage ────────────────────────────────────────────────────────────────────

export function useRecordTriage() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ visitId, data }: { visitId: string; data: TriageInput }) => recordTriage(tenantSlug, visitId, data),
    onSuccess: (_d, { visitId }) => {
      qc.invalidateQueries({ queryKey: ['clinical-visits', tenantSlug] });
      qc.invalidateQueries({ queryKey: ['clinical-visit', tenantSlug, visitId] });
    },
  });
}

// ─── Examination ───────────────────────────────────────────────────────────────

export function useRecordExamination() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ visitId, data }: { visitId: string; data: ExaminationInput }) => recordExamination(tenantSlug, visitId, data),
    onSuccess: (_d, { visitId }) => {
      qc.invalidateQueries({ queryKey: ['clinical-visits', tenantSlug] });
      qc.invalidateQueries({ queryKey: ['clinical-visit', tenantSlug, visitId] });
    },
  });
}

export function usePrescribeFromExamination() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ visitId, data }: { visitId: string; data: PrescribeInput }) => prescribeFromExamination(tenantSlug, visitId, data),
    onSuccess: (_d, { visitId }) => {
      qc.invalidateQueries({ queryKey: ['clinical-visits', tenantSlug] });
      qc.invalidateQueries({ queryKey: ['clinical-visit', tenantSlug, visitId] });
      qc.invalidateQueries({ queryKey: ['prescriptions', tenantSlug] });
    },
  });
}

// ─── Lab ───────────────────────────────────────────────────────────────────────

export function useLabOrders(status?: string) {
  const tenantSlug = useTenantSlug();
  return useQuery({
    queryKey: ['clinical-lab-orders', tenantSlug, status],
    queryFn: () => listLabOrders(tenantSlug, status),
    enabled: !!tenantSlug,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useSubmitLabResults() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ labOrderId, lines }: { labOrderId: string; lines: LabResultLineInput[] }) =>
      submitLabResults(tenantSlug, labOrderId, lines),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinical-lab-orders', tenantSlug] });
      qc.invalidateQueries({ queryKey: ['clinical-visits', tenantSlug] });
    },
  });
}
