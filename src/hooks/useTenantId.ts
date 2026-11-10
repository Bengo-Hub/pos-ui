'use client';

import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';

const AUTH_API_BASE =
  process.env.NEXT_PUBLIC_SSO_URL ||
  process.env.NEXT_PUBLIC_AUTH_API_URL ||
  'https://sso.codevertexafrica.com';

async function fetchTenantIdBySlug(slug: string): Promise<string> {
  const res = await fetch(`${AUTH_API_BASE}/api/v1/tenants/by-slug/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(`tenant lookup failed (${res.status})`);
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error('tenant lookup returned no id');
  return body.id;
}

/**
 * The tenant UUID to use in pos-api paths.
 * Non-owners always use their own tenant. A platform owner working on another tenant's page
 * (the [orgSlug] in the URL) gets that tenant's UUID, resolved from auth by slug. Returns
 * undefined while the lookup is loading or failed, so queries keyed on it stay disabled.
 */
export function useTenantId(): string | undefined {
  const user = useAuthStore((s) => s.user);
  const params = useParams();
  const slug = (params?.orgSlug as string) || '';

  const needsLookup = !!user?.isPlatformOwner && !!slug && slug !== user.tenant_slug;
  const { data } = useQuery({
    queryKey: ['tenant-by-slug', slug],
    queryFn: () => fetchTenantIdBySlug(slug),
    enabled: needsLookup,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const resolved = !user ? undefined : needsLookup ? data : user.tenant_id || undefined;

  // Mirror the value for non-hook callers (async adapters passed to shared components).
  useEffect(() => {
    activeTenantId = resolved;
  }, [resolved]);

  return resolved;
}

/**
 * The tenant slug the page works in. A platform owner gets the [orgSlug] in the URL so
 * payment gateways and other slug-keyed calls use the tenant being viewed; everyone else
 * gets their own slug.
 */
export function usePageTenantSlug(): string {
  const user = useAuthStore((s) => s.user);
  const params = useParams();
  const slug = (params?.orgSlug as string) || '';
  if (user?.isPlatformOwner && slug) return slug;
  return user?.tenant_slug ?? '';
}

/** Throws a clear error when the tenant id is not resolved yet; use in mutation functions. */
export function requireTenant(tenantID: string | undefined): string {
  if (!tenantID) throw new Error('Organisation not loaded yet');
  return tenantID;
}

let activeTenantId: string | undefined;

/** The tenant UUID the last mounted useTenantId() resolved; for code that cannot call hooks. */
export function getActiveTenantId(): string | undefined {
  return activeTenantId;
}
