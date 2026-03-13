/**
 * Public tenant API from auth-service (no auth required).
 * Reused pattern from notifications-ui: fetch tenant for branding (name, slug, metadata).
 */

const AUTH_API_BASE = process.env.NEXT_PUBLIC_SSO_URL || process.env.NEXT_PUBLIC_AUTH_API_URL || 'https://sso.codevertexitsolutions.com';

export interface TenantBrandMetadata {
  logo_url?: string;
  logoUrl?: string;
  primary_color?: string;
  primaryColor?: string;
  secondary_color?: string;
  secondaryColor?: string;
  org_name?: string;
  orgName?: string;
}

export interface TenantResponse {
  id: string;
  name: string;
  slug: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface TenantBrand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  orgName: string;
}

export function parseBrandFromTenant(t: TenantResponse): TenantBrand {
  const meta = (t.metadata || {}) as TenantBrandMetadata;
  const logoUrl = meta.logo_url ?? meta.logoUrl ?? null;
  const primaryColor = (meta.primary_color ?? meta.primaryColor) ?? null;
  const secondaryColor = (meta.secondary_color ?? meta.secondaryColor) ?? null;
  const orgName = (meta.org_name ?? meta.orgName) ?? t.name ?? '';

  return {
    id: t.id,
    name: t.name ?? '',
    slug: t.slug ?? '',
    logoUrl: typeof logoUrl === 'string' ? logoUrl : null,
    primaryColor: typeof primaryColor === 'string' ? primaryColor : null,
    secondaryColor: typeof secondaryColor === 'string' ? secondaryColor : null,
    orgName: typeof orgName === 'string' ? orgName : (t.name ?? ''),
  };
}

export async function fetchTenantBySlug(slug: string): Promise<TenantBrand | null> {
  if (!slug) return null;
  const url = `${AUTH_API_BASE}/api/v1/tenants/by-slug/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as TenantResponse;
    return parseBrandFromTenant(data);
  } catch {
    return null;
  }
}
