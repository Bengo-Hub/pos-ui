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
  listLabTests,
  createLabTest,
  updateLabTest,
  deleteLabTest,
  listDiagnoses,
  createDiagnosis,
  activateLabOrder,
  listPharmacyBills,
  getPharmacyWorkflow,
  updatePharmacyWorkflow,
  type CreatePatientData,
  type CreateVisitData,
  type VisitStatus,
  type TriageInput,
  type ExaminationInput,
  type PrescribeInput,
  type LabResultLineInput,
  type LabTestInput,
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

// ─── Lab test catalogue ────────────────────────────────────────────────────────

export function useLabTests(params?: { category?: string; q?: string; include_inactive?: boolean }) {
  const tenantSlug = useTenantSlug();
  return useQuery({
    queryKey: ['clinical-lab-tests', tenantSlug, params],
    queryFn: () => listLabTests(tenantSlug, params),
    enabled: !!tenantSlug,
    staleTime: 5 * 60_000,
  });
}

export function useSaveLabTest() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: LabTestInput }) =>
      id ? updateLabTest(tenantSlug, id, body) : createLabTest(tenantSlug, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinical-lab-tests', tenantSlug] }),
  });
}

export function useDeleteLabTest() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLabTest(tenantSlug, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinical-lab-tests', tenantSlug] }),
  });
}

// ─── Diagnosis catalogue ───────────────────────────────────────────────────────

export function useDiagnoses(q?: string) {
  const tenantSlug = useTenantSlug();
  return useQuery({
    queryKey: ['clinical-diagnoses', tenantSlug, q],
    queryFn: () => listDiagnoses(tenantSlug, q),
    enabled: !!tenantSlug,
    staleTime: 5 * 60_000,
  });
}

export function useCreateDiagnosis() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; code?: string; category?: string }) => createDiagnosis(tenantSlug, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinical-diagnoses', tenantSlug] }),
  });
}

// ─── Lab order activation + Bills queue ────────────────────────────────────────

export function useActivateLabOrder() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labOrderId: string) => activateLabOrder(tenantSlug, labOrderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinical-lab-orders', tenantSlug] }),
  });
}

export function usePharmacyBills() {
  const tenantSlug = useTenantSlug();
  return useQuery({
    queryKey: ['pharmacy-bills', tenantSlug],
    queryFn: () => listPharmacyBills(tenantSlug),
    enabled: !!tenantSlug,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

// ─── Pharmacy dispensing-workflow config ───────────────────────────────────────

export function usePharmacyWorkflow(outletId?: string) {
  const tenantSlug = useTenantSlug();
  return useQuery({
    queryKey: ['pharmacy-workflow-config', tenantSlug, outletId],
    queryFn: () => getPharmacyWorkflow(tenantSlug, outletId),
    enabled: !!tenantSlug,
    staleTime: 60_000,
  });
}

export function useUpdatePharmacyWorkflow() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { outlet_id?: string; pharmacy_workflow_mode?: 'direct' | 'billing'; require_lab_prepayment?: boolean }) =>
      updatePharmacyWorkflow(tenantSlug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pharmacy-workflow-config', tenantSlug] });
      // The Bills nav item is derived from this mode — refresh the settings the sidebar reads.
      qc.invalidateQueries({ queryKey: ['pos-settings'] });
    },
  });
}
