'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';

const AUTH_API_BASE =
  process.env.NEXT_PUBLIC_SSO_URL ||
  process.env.NEXT_PUBLIC_AUTH_API_URL ||
  'https://sso.codevertexafrica.com';

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  use_case?: string;
}

/**
 * All active tenants from auth-api GET /api/v1/admin/tenants (platform-owner JWT required).
 * Mirrors treasury-ui's use-platform-tenants: the endpoint returns the shared pagination
 * envelope ({ data, total, … }); bare-array and { tenants } shapes are tolerated. Powers the
 * Sync-Monitor Txn-Reversals tenant selector — the tool must operate on ANY tenant's sales,
 * not just the platform owner's own org.
 */
export function usePlatformTenants(enabled = true) {
  const token = useAuthStore((s) => s.session?.accessToken);
  return useQuery<PlatformTenant[]>({
    queryKey: ['platform-tenants'],
    queryFn: async () => {
      const resp = await fetch(`${AUTH_API_BASE}/api/v1/admin/tenants?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const err = new Error(`tenant list failed (${resp.status})`) as Error & { status?: number };
        err.status = resp.status;
        throw err;
      }
      const json = await resp.json();
      const list = Array.isArray(json) ? json : json.data ?? json.tenants ?? [];
      return (list as PlatformTenant[]).filter((t) => t.id && t.slug);
    },
    enabled: !!token && enabled,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      const status = (error as { status?: number })?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 1;
    },
  });
}
