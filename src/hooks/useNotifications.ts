'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/api/notifications';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

export function useNotifications(includeRead = false) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-notifications', tenantID, includeRead],
    queryFn: () => getNotifications(tenantID, includeRead),
    enabled: !!tenantID,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(tenantID, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(tenantID),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-notifications'] }),
  });
}
