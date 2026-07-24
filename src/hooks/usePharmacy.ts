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
  type CreatePrescriptionData,
  type PrescriptionFilters,
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
    mutationFn: (id: string) => dispensePrescription(tenantSlug, id),
    onSuccess: (_data, id) => {
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
