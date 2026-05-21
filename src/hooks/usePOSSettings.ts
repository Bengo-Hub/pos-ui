'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { posSettingsApi, type UpdatePOSModulesInput, type UpdatePOSSettingsInput } from '@/lib/api/settings';

export type { POSSettings } from '@/lib/api/settings';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

export function usePOSSettings() {
  const tenantID = useTenantID();

  return useQuery({
    queryKey: ['pos-settings', tenantID],
    queryFn: () => posSettingsApi.get(tenantID),
    enabled: !!tenantID,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdatePOSSettings() {
  const tenantID = useTenantID();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdatePOSSettingsInput) => posSettingsApi.put(tenantID, input),
    onSuccess: (data) => {
      qc.setQueryData(['pos-settings', tenantID], data);
      toast.success('Settings saved');
    },
    onError: () => toast.error('Failed to save settings'),
  });
}

export function useUpdateShiftSettings() {
  const tenantID = useTenantID();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: { shift_auto_end_enabled?: boolean; shift_max_hours?: number }) =>
      posSettingsApi.patchShifts(tenantID, input),
    onSuccess: (data) => {
      qc.setQueryData(['pos-settings', tenantID], data);
      toast.success('Shift settings saved');
    },
    onError: () => toast.error('Failed to save shift settings'),
  });
}

export function useUpdatePOSModules() {
  const tenantID = useTenantID();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdatePOSModulesInput) => posSettingsApi.patchModules(tenantID, input),
    onSuccess: (data) => {
      qc.setQueryData(['pos-settings', tenantID], data);
      toast.success('Module settings saved');
    },
    onError: () => toast.error('Failed to save module settings'),
  });
}
