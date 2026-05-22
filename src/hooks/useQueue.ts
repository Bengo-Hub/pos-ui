'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queueApi, type CreateQueueEntryInput, type QueueStatus } from '@/lib/api/queue';
import { useAuthStore } from '@/store/auth';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

export function useQueue(outletID?: string, status?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-queue', tenantID, outletID, status],
    queryFn: () => queueApi.list(tenantID, outletID, status),
    enabled: !!tenantID,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });
}

export function useCreateQueueEntry() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQueueEntryInput) => queueApi.create(tenantID, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-queue', tenantID] }),
  });
}

export function useUpdateQueueStatus() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryID, status }: { entryID: string; status: QueueStatus }) =>
      queueApi.updateStatus(tenantID, entryID, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-queue', tenantID] }),
  });
}
