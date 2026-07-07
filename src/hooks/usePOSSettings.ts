'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { posSettingsApi, type POSSettings, type UpdatePOSModulesInput, type UpdatePOSSettingsInput } from '@/lib/api/settings';

export type { POSSettings } from '@/lib/api/settings';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { cacheFirst } from '@/lib/offline/cache-first';
import { getDataset, datasetCacheOpts } from '@/lib/offline/datasets';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

/** Keep the React Query cache AND the IndexedDB dataset in step after a settings write,
 *  so an offline reload right after saving never serves the pre-save settings. */
function writeSettingsCaches(qc: ReturnType<typeof useQueryClient>, tenantID: string, data: POSSettings) {
  qc.setQueryData(['pos-settings', tenantID], data);
  void import('@/lib/db/kv-cache').then(({ setKV, kvKey }) => setKV(kvKey('pos-settings', tenantID), tenantID, data));
}

export function usePOSSettings() {
  const tenantID = useTenantID();
  const qc = useQueryClient();

  return useQuery({
    queryKey: ['pos-settings', tenantID],
    // IndexedDB-first: cached settings paint instantly (screensaver/tender display/VAT keep
    // working offline or on weak wifi); a background revalidate keeps them fresh.
    queryFn: () =>
      cacheFirst(datasetCacheOpts(getDataset('pos-settings'), tenantID, undefined, qc)) as Promise<POSSettings>,
    enabled: !!tenantID,
    staleTime: 5 * 60 * 1000,
    networkMode: 'always',
  });
}

export function useUpdatePOSSettings() {
  const tenantID = useTenantID();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdatePOSSettingsInput) => posSettingsApi.put(tenantID, input),
    onSuccess: (data) => {
      writeSettingsCaches(qc, tenantID, data);
      toast.success('Settings saved');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save settings')),
  });
}

export function useUpdateShiftSettings() {
  const tenantID = useTenantID();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: { shift_auto_end_enabled?: boolean; shift_max_hours?: number }) =>
      posSettingsApi.patchShifts(tenantID, input),
    onSuccess: (data) => {
      writeSettingsCaches(qc, tenantID, data);
      toast.success('Shift settings saved');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save shift settings')),
  });
}

export function useUpdateTableSettings() {
  const tenantID = useTenantID();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: { table_max_occupation_minutes?: number }) =>
      posSettingsApi.patchTables(tenantID, input),
    onSuccess: (data) => {
      writeSettingsCaches(qc, tenantID, data);
      toast.success('Table settings saved');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save table settings')),
  });
}

export function useUpdatePOSModules() {
  const tenantID = useTenantID();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdatePOSModulesInput) => posSettingsApi.patchModules(tenantID, input),
    onSuccess: (data) => {
      writeSettingsCaches(qc, tenantID, data);
      toast.success('Module settings saved');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save module settings')),
  });
}

export function useUpdateOutletConfig() {
  const tenantID = useTenantID();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: { use_case?: string | null }) => posSettingsApi.patchOutletConfig(tenantID, input),
    onSuccess: (data) => {
      writeSettingsCaches(qc, tenantID, data);
      toast.success('Outlet configuration saved');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save outlet configuration')),
  });
}
