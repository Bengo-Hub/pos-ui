
const SSO_BASE_URL = process.env.NEXT_PUBLIC_SSO_URL || 'https://sso.codevertexitsolutions.com';
const SSO_CLIENT_ID = process.env.NEXT_PUBLIC_SSO_CLIENT_ID || 'pos-ui';

export interface AuthorizeParams {
  codeChallenge: string;
  state: string;
  redirectUri: string;
  scope?: string;
  /** Pass explicitly so token is minted for this tenant (e.g. orgSlug from route). */
  tenant?: string;
}

export interface TokenExchangeParams {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export function buildAuthorizeUrl({ codeChallenge, state, redirectUri, scope, tenant: tenantParam }: AuthorizeParams): string {
  const url = new URL('/api/v1/authorize', SSO_BASE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', SSO_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scope || 'openid profile email offline_access');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  const tenant = tenantParam ?? (typeof window !== 'undefined' ? localStorage.getItem('tenantSlug') : null);
  if (tenant) {
    url.searchParams.set('tenant', tenant);
  }

  return url.toString();
}

export function buildLogoutUrl(postLogoutRedirectUri?: string): string {
  const url = new URL('/api/v1/auth/logout', SSO_BASE_URL);
  if (postLogoutRedirectUri) {
    url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
  }
  return url.toString();
}

/**
 * Best-effort POST to revoke the user's backend SSO session: deletes their Redis
 * session_token keys + DB sessions and clears the cookie. POS still redirects to
 * PIN login afterwards (staff re-authenticate locally), but the underlying SSO
 * session is invalidated so a stolen refresh token can't be reused. Never throws.
 */
export async function revokeServerSession(accessToken?: string | null): Promise<void> {
  try {
    await fetch(new URL('/api/v1/auth/logout', SSO_BASE_URL).toString(), {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      credentials: 'include',
      keepalive: true,
    });
  } catch {
    /* best-effort: still clear local state + redirect */
  }
}

export async function exchangeCodeForTokens(params: TokenExchangeParams) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: SSO_CLIENT_ID,
    code_verifier: params.codeVerifier,
  });

  const response = await fetch(`${SSO_BASE_URL}/api/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error_description || errorData.error || 'Token exchange failed');
  }

  return response.json();
}

export async function refreshTokens(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const response = await fetch(`${SSO_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken, client_id: SSO_CLIENT_ID }),
  });
  if (!response.ok) throw new Error('Token refresh failed');
  return response.json();
}

/**
 * Fetches POS service-level identity enrichment from pos-api.
 * Called after SSO login to get the mapped POS role + fine-grained pos.*.* permissions.
 * Falls back gracefully — if pos-api is unavailable, pos-ui falls back to role inference.
 */
export async function fetchPosServiceProfile(
  accessToken: string,
  tenantId: string
): Promise<{ posRole: string; permissions: string[] } | null> {
  try {
    const POS_API_URL = process.env.NEXT_PUBLIC_POS_API_URL ?? '';
    const response = await fetch(`${POS_API_URL}/api/v1/${tenantId}/pos/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Tenant-ID': tenantId },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return {
      posRole: data.pos_role ?? '',
      permissions: data.permissions ?? [],
    };
  } catch {
    return null;
  }
}

/** Fetches current user profile from auth-api (SSO). Use for /me with TanStack Query + TTL. */
export async function fetchProfile(accessToken: string): Promise<{
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  tenant_id: string;
  tenant_slug: string;
  isPlatformOwner: boolean;
  isSuperUser: boolean;
}> {
  const response = await fetch(`${SSO_BASE_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const err = new Error('Failed to fetch profile') as Error & { status?: number };
    err.status = response.status;
    throw err;
  }
  const data = await response.json();
  const slug = data.tenant_slug ?? data.tenant?.slug ?? '';
  const roles: string[] = data.roles ?? [];
  return {
    id: data.id ?? '',
    email: data.email ?? '',
    fullName: data.profile?.name ?? data.full_name ?? data.email ?? '',
    roles,
    permissions: data.permissions ?? [],
    tenant_id: data.tenant_id ?? data.primary_tenant ?? '',
    tenant_slug: slug,
    isPlatformOwner: data.is_platform_owner === true || slug === 'codevertex',
    isSuperUser: roles.includes('superuser'),
  };
}
