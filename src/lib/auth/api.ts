import { apiClient } from '@/lib/api/client';

const SSO_BASE_URL = process.env.NEXT_PUBLIC_SSO_URL || 'https://sso.codevertexitsolutions.com';
const SSO_CLIENT_ID = process.env.NEXT_PUBLIC_SSO_CLIENT_ID || 'pos-ui';

export interface AuthorizeParams {
  codeChallenge: string;
  state: string;
  redirectUri: string;
  scope?: string;
}

export interface TokenExchangeParams {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export function buildAuthorizeUrl({ codeChallenge, state, redirectUri, scope }: AuthorizeParams): string {
  const url = new URL('/api/v1/authorize', SSO_BASE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', SSO_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scope || 'openid profile email offline_access');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  const tenant = typeof window !== 'undefined' ? localStorage.getItem('tenantSlug') : null;
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

/** Fetches current user profile from auth-api (SSO). Use for /me with TanStack Query + TTL. */
export async function fetchProfile(accessToken: string) {
  const response = await fetch(`${SSO_BASE_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Failed to fetch profile');
  return response.json();
}
