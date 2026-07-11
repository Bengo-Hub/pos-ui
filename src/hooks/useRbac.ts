'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rbacApi, type CreatePOSRoleInput } from '@/lib/api/rbac';
import { useAuthStore } from '@/store/auth';

const ROLES_KEY = 'pos-rbac-roles';
const PERMS_KEY = 'pos-rbac-permissions';
const ROLE_PERMS_KEY = 'pos-rbac-role-permissions';

/**
 * useRbacRoles/useRbacPermissions scope results to the CURRENT outlet's use case by default
 * (a hospitality outlet shouldn't see pharmacy/retail/services-exclusive roles & permissions,
 * and vice versa — common/cross-cutting ones always show). Pass `useCase: null` explicitly to
 * fetch the unscoped full catalogue (e.g. platform-owner tooling).
 */
export function useRbacRoles(tenantId: string, useCase?: string | null) {
  const outletUseCase = useAuthStore((s) => s.outlet?.use_case);
  const effectiveUseCase = useCase === null ? undefined : (useCase ?? outletUseCase ?? undefined);
  return useQuery({
    queryKey: [ROLES_KEY, tenantId, effectiveUseCase ?? 'all'],
    queryFn: () => rbacApi.listRoles(tenantId, effectiveUseCase),
    enabled: !!tenantId,
    placeholderData: [],
    staleTime: 300_000,
  });
}

export function useRbacPermissions(tenantId: string, useCase?: string | null) {
  const outletUseCase = useAuthStore((s) => s.outlet?.use_case);
  const effectiveUseCase = useCase === null ? undefined : (useCase ?? outletUseCase ?? undefined);
  return useQuery({
    queryKey: [PERMS_KEY, tenantId, effectiveUseCase ?? 'all'],
    queryFn: () => rbacApi.listPermissions(tenantId, effectiveUseCase),
    enabled: !!tenantId,
    placeholderData: [],
    staleTime: 300_000,
  });
}

export function useRolePermissions(tenantId: string, roleId: string | null) {
  return useQuery({
    queryKey: [ROLE_PERMS_KEY, tenantId, roleId],
    queryFn: () => rbacApi.getRolePermissions(tenantId, roleId as string),
    enabled: !!tenantId && !!roleId,
    staleTime: 60_000,
  });
}

export function useCreateRole(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePOSRoleInput) => rbacApi.createRole(tenantId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROLES_KEY, tenantId] }),
  });
}

export function useUpdateRole(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, name, description }: { roleId: string; name?: string; description?: string }) =>
      rbacApi.updateRole(tenantId, roleId, { name, description }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROLES_KEY, tenantId] }),
  });
}

export function useDeleteRole(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => rbacApi.deleteRole(tenantId, roleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROLES_KEY, tenantId] }),
  });
}

export function useSetRolePermissions(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) =>
      rbacApi.setRolePermissions(tenantId, roleId, permissionIds),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: [ROLE_PERMS_KEY, tenantId, vars.roleId] }),
  });
}
