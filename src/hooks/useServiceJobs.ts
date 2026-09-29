'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiErrorMessage } from '@/lib/api/error-message';
import { posSettingsApi } from '@/lib/api/settings';
import {
  serviceJobsApi,
  type JobUpdateInput,
  type ServiceProfile,
} from '@/lib/api/service-jobs';
import { normalizeUseCase } from '@/lib/use-case-config';
import { usePOSSettings, writeSettingsCaches } from '@/hooks/usePOSSettings';
import { useEffectiveOutletID } from '@/hooks/usePOS';
import { useAuthStore } from '@/store/auth';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

/** The services sub use case registry. Static per deploy, so it is cached for a long time. */
export function useServiceProfiles(enabled = true) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-service-profiles', tenantID],
    queryFn: async () => (await serviceJobsApi.listProfiles(tenantID)).data ?? [],
    enabled: enabled && !!tenantID,
    staleTime: 60 * 60 * 1000,
  });
}

export interface OutletServiceProfile {
  /** True when the active outlet runs the services use case. */
  isServices: boolean;
  profile: ServiceProfile | null;
  /** True when the profile's workflow is a job order (printing, garage, laundry, tailoring). */
  isJobWorkflow: boolean;
  depositPercent: number;
  loading: boolean;
}

/** Resolves the active outlet's service profile from its settings plus the registry. */
export function useOutletServiceProfile(): OutletServiceProfile {
  const outlet = useAuthStore((s) => s.outlet);
  const isServices = normalizeUseCase(outlet?.use_case) === 'services';
  const { data: settings, isLoading: settingsLoading } = usePOSSettings();
  const key = isServices ? settings?.service_profile ?? '' : '';
  const { data: profiles, isLoading: profilesLoading } = useServiceProfiles(isServices && !!key);

  return useMemo(() => {
    const profile = key ? profiles?.find((p) => p.key === key) ?? null : null;
    return {
      isServices,
      profile,
      isJobWorkflow: profile?.workflow === 'job',
      depositPercent: settings?.job_deposit_percent ?? profile?.default_deposit_percent ?? 0,
      loading: settingsLoading || (!!key && profilesLoading),
    };
  }, [isServices, key, profiles, settings?.job_deposit_percent, settingsLoading, profilesLoading]);
}

/** Admin: set the outlet's service profile and/or default job deposit. */
export function useUpdateServiceProfile() {
  const tenantID = useTenantID();
  const outletID = useEffectiveOutletID() || undefined;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { service_profile?: string; job_deposit_percent?: number }) =>
      posSettingsApi.patchServiceProfile(tenantID, input),
    onSuccess: (data) => {
      writeSettingsCaches(qc, tenantID, outletID, data);
      // A job profile can switch on the production board and create its default stations.
      qc.invalidateQueries({ queryKey: ['kds-stations'] });
      qc.invalidateQueries({ queryKey: ['kds-stations-all'] });
      toast.success('Service type saved');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save service type')),
  });
}

/** Moves a job through its stages, records proof decisions and collection. */
export function useUpdateJob() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, input }: { orderId: string; input: JobUpdateInput }) =>
      serviceJobsApi.updateJob(tenantID, orderId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-orders'] });
      qc.invalidateQueries({ queryKey: ['kds-tickets'] });
      qc.invalidateQueries({ queryKey: ['pos-job-summary'] });
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to update the job')),
  });
}

/** Jobs dashboard counts for the active outlet; refreshed every minute. */
export function useJobSummary(enabled = true) {
  const tenantID = useTenantID();
  const outletID = useEffectiveOutletID();
  return useQuery({
    queryKey: ['pos-job-summary', tenantID, outletID],
    queryFn: () => serviceJobsApi.summary(tenantID),
    enabled: enabled && !!tenantID,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Uploads one job reference file (max 512 KB, images or PDF). */
export function useUploadJobAttachment() {
  const tenantID = useTenantID();
  return useMutation({
    mutationFn: (file: File) => serviceJobsApi.uploadAttachment(tenantID, file),
  });
}
