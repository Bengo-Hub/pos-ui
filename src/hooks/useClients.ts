'use client';

import { useQuery } from '@tanstack/react-query';
import { clientsApi } from '@/lib/api/clients';
import { useAuthStore } from '@/store/auth';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

export function useClientSearch(phone?: string, name?: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-clients', tenantID, phone, name],
    queryFn: () => clientsApi.searchAccounts(tenantID, phone || undefined, name || undefined),
    enabled: !!tenantID && !!(phone || name),
    staleTime: 30_000,
  });
}

export function useClient(accountID: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-client', tenantID, accountID],
    queryFn: () => clientsApi.getAccount(tenantID, accountID),
    enabled: !!tenantID && !!accountID,
    staleTime: 60_000,
  });
}
