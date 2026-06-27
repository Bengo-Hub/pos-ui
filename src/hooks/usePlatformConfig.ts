'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  platformConfigApi,
  type UpsertPlatformConfigBody,
} from '@/lib/api/platform-config';
import { apiErrorMessage } from '@/lib/api/error-message';

export { SCREENSAVER_TIMEOUT_KEY } from '@/lib/api/platform-config';
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
