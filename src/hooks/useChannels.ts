'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}
function base(tenantID: string) {
  return `/api/v1/${tenantID}/pos/channels`;
}

export interface SalesChannel {
  id: string;
  channel_name: string;
  channel_type: string;
  status?: string;
  last_synced_at?: string | null;
  created_at?: string;
}

interface ListResp {
  data?: SalesChannel[];
  total?: number;
}

export function useChannels() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-channels', tenantID],
    queryFn: () =>
      apiClient
        .get<SalesChannel[] | ListResp>(base(tenantID))
        .then((res) => (Array.isArray(res) ? res : res.data ?? [])),
    enabled: !!tenantID,
    staleTime: 30_000,
  });
}

export function useCreateChannel() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { channel_name: string; channel_type: string; config_json?: Record<string, unknown> }) =>
      apiClient.post<SalesChannel>(base(tenantID), data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-channels', tenantID] }),
  });
}

export function useTriggerChannelSync() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) =>
      apiClient.post(`${base(tenantID)}/${channelId}/sync-jobs`, { job_type: 'catalog_sync' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-channels', tenantID] }),
  });
}
