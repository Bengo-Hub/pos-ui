'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  platformConfigApi,
  type UpsertPlatformConfigBody,
} from '@/lib/api/platform-config';
import { apiErrorMessage } from '@/lib/api/error-message';

export { SCREENSAVER_TIMEOUT_KEY, PROVIDER_FOOTER_KEY } from '@/lib/api/platform-config';
export type { PlatformConfig } from '@/lib/api/platform-config';

export function usePlatformConfigs() {
  return useQuery({
    queryKey: ['platform-configs'],
    queryFn: () => platformConfigApi.list(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertPlatformConfig() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: UpsertPlatformConfigBody }) =>
      platformConfigApi.upsert(key, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-configs'] });
      toast.success('Platform setting saved');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save platform setting')),
  });
}

/** A SPECIFIC tenant's config overrides (platform-owner picks the tenant) — distinct from any
 *  tenant's own self-service settings. */
export function useTenantOverrides(tenantID?: string) {
  return useQuery({
    queryKey: ['platform-tenant-overrides', tenantID],
    queryFn: () => platformConfigApi.listTenantOverrides(tenantID as string),
    enabled: !!tenantID,
    staleTime: 60 * 1000,
  });
}

export function useUpsertTenantOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantID, key, body }: { tenantID: string; key: string; body: UpsertPlatformConfigBody }) =>
      platformConfigApi.upsertTenantOverride(tenantID, key, body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['platform-tenant-overrides', vars.tenantID] });
      toast.success('Tenant override saved');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save tenant override')),
  });
}

export function useDeleteTenantOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantID, key }: { tenantID: string; key: string }) =>
      platformConfigApi.deleteTenantOverride(tenantID, key),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['platform-tenant-overrides', vars.tenantID] });
      toast.success('Tenant override cleared — reverted to platform default');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to clear tenant override')),
  });
}
