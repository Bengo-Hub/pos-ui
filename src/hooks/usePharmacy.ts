'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import {
  listPrescriptions,
  getPrescription,
  createPrescription,
  dispensePrescription,
  approvePrescription,
  lockPrescription,
  searchCRMContacts,
  linkCRMContact,
  checkoutPrescription,
  rejectPrescription,
  cancelPrescription,
  listControlledLogs,
  createControlledLog,
  type CreatePrescriptionData,
  type PrescriptionFilters,
  type DispenseOptions,
  type CreateControlledLogData,
} from '@/lib/api/pharmacy';

function useTenantSlug() {
  return useAuthStore((s) => s.user?.tenant_slug ?? '');
}

// ─── List prescriptions ───────────────────────────────────────────────────────

export function usePrescriptions(filters?: PrescriptionFilters) {
  const tenantSlug = useTenantSlug();
  return useQuery({
    queryKey: ['prescriptions', tenantSlug, filters],
    queryFn: () => listPrescriptions(tenantSlug, filters),
    enabled: !!tenantSlug,
    staleTime: 30_000,
  });
}

// ─── Single prescription ──────────────────────────────────────────────────────

export function usePrescription(id: string) {
  const tenantSlug = useTenantSlug();
  return useQuery({
    queryKey: ['prescription', tenantSlug, id],
    queryFn: () => getPrescription(tenantSlug, id),
    enabled: !!tenantSlug && !!id,
    staleTime: 30_000,
  });
}

// ─── Create prescription ──────────────────────────────────────────────────────

export function useCreatePrescription() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePrescriptionData) => createPrescription(tenantSlug, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prescriptions', tenantSlug] });
    },
  });
}

// ─── Dispense prescription ────────────────────────────────────────────────────

export function useDispensePrescription() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, options }: { id: string; options?: DispenseOptions }) =>
      dispensePrescription(tenantSlug, id, options),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['prescriptions', tenantSlug] });
      qc.invalidateQueries({ queryKey: ['prescription', tenantSlug, id] });
    },
  });
}

// ─── Checkout (create the payable order for a dispensed prescription) ────────

export function useCheckoutPrescription() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => checkoutPrescription(tenantSlug, id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['prescriptions', tenantSlug] });
      qc.invalidateQueries({ queryKey: ['prescription', tenantSlug, id] });
    },
  });
}

// ─── Reject prescription ───────────────────────────────────────────────────────

export function useRejectPrescription() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectPrescription(tenantSlug, id, reason),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['prescriptions', tenantSlug] });
      qc.invalidateQueries({ queryKey: ['prescription', tenantSlug, id] });
    },
  });
}

// ─── Cancel prescription (administrative withdrawal, distinct from Reject) ───

export function useCancelPrescription() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelPrescription(tenantSlug, id, reason),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['prescriptions', tenantSlug] });
      qc.invalidateQueries({ queryKey: ['prescription', tenantSlug, id] });
    },
  });
}

// ─── Approve / lock prescription ──────────────────────────────────────────────

export function useApprovePrescription() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, overrideReason }: { id: string; overrideReason?: string }) =>
      approvePrescription(tenantSlug, id, overrideReason),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['prescriptions', tenantSlug] });
      qc.invalidateQueries({ queryKey: ['prescription', tenantSlug, id] });
    },
  });
}

export function useLockPrescription() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => lockPrescription(tenantSlug, id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['prescriptions', tenantSlug] });
      qc.invalidateQueries({ queryKey: ['prescription', tenantSlug, id] });
    },
  });
}

// ─── Patient <-> CRM contact linkage (Phase 8) ────────────────────────────────

export function useCRMContactSearch(query: string) {
  const tenantSlug = useTenantSlug();
  return useQuery({
    queryKey: ['crm-contacts', tenantSlug, query],
    queryFn: () => searchCRMContacts(tenantSlug, query),
    enabled: !!tenantSlug && query.trim().length >= 2,
    staleTime: 30_000,
  });
}

export function useLinkCRMContact() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, crmContactId }: { id: string; crmContactId: string }) =>
      linkCRMContact(tenantSlug, id, crmContactId),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['prescriptions', tenantSlug] });
      qc.invalidateQueries({ queryKey: ['prescription', tenantSlug, id] });
    },
  });
}

// ─── Controlled-substance dispensing register ─────────────────────────────────

export function useControlledLogs(params?: { catalog_item_id?: string; page?: number; limit?: number }) {
  const tenantSlug = useTenantSlug();
  return useQuery({
    queryKey: ['controlled-substance-logs', tenantSlug, params],
    queryFn: () => listControlledLogs(tenantSlug, params),
    enabled: !!tenantSlug,
    staleTime: 15_000,
  });
}

export function useCreateControlledLog() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateControlledLogData) => createControlledLog(tenantSlug, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['controlled-substance-logs', tenantSlug] });
    },
  });
}
