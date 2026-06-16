'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backupsApi, type BackupSettings } from '@/lib/api/backups';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';

export type { BackupSettings } from '@/lib/api/backups';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

export function useBackupSettings() {
  const tenantID = useTenantID();

  return useQuery({
    queryKey: ['backup-settings', tenantID],
    queryFn: () => backupsApi.getSettings(tenantID),
    enabled: !!tenantID,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateBackupSettings() {
  const tenantID = useTenantID();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: BackupSettings) => backupsApi.updateSettings(tenantID, input),
    onSuccess: (data) => {
      qc.setQueryData(['backup-settings', tenantID], data);
      toast.success('Backup settings saved');
    },
    onError: () => toast.error('Failed to save backup settings'),
  });
}
