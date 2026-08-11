'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { posSettingsApi, type POSSettings, type UpdatePOSModulesInput, type UpdatePOSSettingsInput } from '@/lib/api/settings';

export type { POSSettings } from '@/lib/api/settings';
import { useAuthStore } from '@/store/auth';
import { useEffectiveOutletID } from '@/hooks/usePOS';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { cacheFirst } from '@/lib/offline/cache-first';
import { getDataset, datasetCacheOpts } from '@/lib/offline/datasets';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

const POS_SETTINGS = getDataset('pos-settings');

/** Keep the React Query cache AND the IndexedDB dataset in step after a settings write,
 *  so an offline reload right after saving never serves the pre-save settings. outletID must
 *  match whatever the read hook (usePOSSettings) is currently keyed on — pos-settings is
 *  outlet-scoped (POSSettings.outlet_id, resolved server-side from X-Outlet-ID). */
function writeSettingsCaches(qc: ReturnType<typeof useQueryClient>, tenantID: string, outletID: string | undefined, data: POSSettings) {
  qc.setQueryData(POS_SETTINGS.queryKey(tenantID, outletID), data);
  void import('@/lib/db/kv-cache').then(({ setKV, kvKey }) => setKV(kvKey('pos-settings', tenantID, outletID), tenantID, data));
}

export function usePOSSettings() {
  const tenantID = useTenantID();
  const outletID = useEffectiveOutletID() || undefined;
  const qc = useQueryClient();

  return useQuery({
    queryKey: POS_SETTINGS.queryKey(tenantID, outletID),
    // IndexedDB-first: cached settings paint instantly (screensaver/tender display/VAT keep
    // working offline or on weak wifi); a background revalidate keeps them fresh.
    queryFn: () =>
      cacheFirst(datasetCacheOpts(POS_SETTINGS, tenantID, outletID, qc)) as Promise<POSSettings>,
    enabled: !!tenantID,
    staleTime: 5 * 60 * 1000,
    networkMode: 'always',
  });
}

export function useUpdatePOSSettings() {
  const tenantID = useTenantID();
  const outletID = useEffectiveOutletID() || undefined;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdatePOSSettingsInput) => posSettingsApi.put(tenantID, input),
    onSuccess: (data) => {
      writeSettingsCaches(qc, tenantID, outletID, data);
      toast.success('Settings saved');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save settings')),
  });
}

export function useUpdateShiftSettings() {
  const tenantID = useTenantID();
  const outletID = useEffectiveOutletID() || undefined;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: { shift_auto_end_enabled?: boolean; shift_max_hours?: number }) =>
      posSettingsApi.patchShifts(tenantID, input),
    onSuccess: (data) => {
      writeSettingsCaches(qc, tenantID, outletID, data);
      toast.success('Shift settings saved');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save shift settings')),
  });
}

export function useUpdateTableSettings() {
  const tenantID = useTenantID();
  const outletID = useEffectiveOutletID() || undefined;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: { table_max_occupation_minutes?: number }) =>
      posSettingsApi.patchTables(tenantID, input),
    onSuccess: (data) => {
      writeSettingsCaches(qc, tenantID, outletID, data);
      toast.success('Table settings saved');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save table settings')),
  });
}

export function useUpdatePOSModules() {
  const tenantID = useTenantID();
  const outletID = useEffectiveOutletID() || undefined;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdatePOSModulesInput) => posSettingsApi.patchModules(tenantID, input),
    onSuccess: (data) => {
      writeSettingsCaches(qc, tenantID, outletID, data);
      toast.success('Module settings saved');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save module settings')),
  });
}

export function useUpdateOutletConfig() {
  const tenantID = useTenantID();
  const outletID = useEffectiveOutletID() || undefined;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: { use_case?: string | null }) => posSettingsApi.patchOutletConfig(tenantID, input),
    onSuccess: (data) => {
      writeSettingsCaches(qc, tenantID, outletID, data);
      toast.success('Outlet configuration saved');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save outlet configuration')),
  });
}
