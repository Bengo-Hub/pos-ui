'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

function basePath(tenantID: string) {
  return `/api/v1/${tenantID}/pos/packages`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ServicePackage {
  id: string;
  name: string;
  description?: string;
  price: number;
  session_count: number;
  validity_days?: number;
  is_active: boolean;
  created_at: string;
}

export interface CreatePackageInput {
  name: string;
  description?: string;
  price: number;
  session_count: number;
  validity_days?: number;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const packageKeys = {
  all: (tid: string) => ['packages', tid] as const,
  list: (tid: string) => ['packages', tid, 'list'] as const,
  detail: (tid: string, id: string) => ['packages', tid, id] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function usePackages() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: packageKeys.list(tenantID),
    queryFn: () => apiClient.get<{ data: ServicePackage[]; total: number }>(basePath(tenantID)),
    enabled: !!tenantID,
    select: (res) => res.data ?? [],
  });
}

export function usePackage(id: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: packageKeys.detail(tenantID, id),
    queryFn: () => apiClient.get<ServicePackage>(`${basePath(tenantID)}/${id}`),
    enabled: !!tenantID && !!id,
  });
}

export function useCreatePackage() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePackageInput) =>
      apiClient.post<ServicePackage>(basePath(tenantID), data),
    onSuccess: () => qc.invalidateQueries({ queryKey: packageKeys.all(tenantID) }),
  });
}

export function useUpdatePackage(id: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreatePackageInput>) =>
      apiClient.put<ServicePackage>(`${basePath(tenantID)}/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: packageKeys.all(tenantID) }),
  });
}

export function useDeactivatePackage() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ ok: boolean }>(`${basePath(tenantID)}/${id}/deactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: packageKeys.all(tenantID) }),
  });
}
