/**
 * Direct browser → auth-api calls for privileged account actions surfaced on the Team page
 * (hard delete, admin password reset). Mirrors the existing `revokeServerSession` pattern
 * (shared-ui-lib) of calling auth-api directly with the caller's own bearer token rather than
 * proxying through pos-api — auth-api is the sole owner of both the account record and the
 * password, so pos-api has nothing useful to add as a middle hop, and CORS is already open
 * for this origin (the same origin revokeServerSession/logout already rely on).
 */

const SSO_BASE_URL = process.env.NEXT_PUBLIC_SSO_URL || 'https://sso.codevertexafrica.com';

async function authFetch<T>(path: string, accessToken: string | null | undefined, init: RequestInit = {}): Promise<T> {
  const res = await fetch(new URL(path, SSO_BASE_URL).toString(), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const message = (body.error_description || body.error || body.message) as string | undefined;
    throw new Error(message || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json().catch(() => undefined as T);
}

/**
 * Platform-admin-only. Permanently deletes the user's SSO account (auth-api's existing
 * `AdminPurgeUser`) and, via the `auth.user.deleted` event it publishes, cascades to every
 * service that mirrors a copy of the user — including this one. Irreversible.
 */
export function purgeUserAccount(accessToken: string | null | undefined, userId: string): Promise<void> {
  return authFetch<void>(`/api/v1/admin/users/${userId}/purge`, accessToken, { method: 'POST' });
}

/**
 * Directly sets the user's password. Omit `newPassword` to have auth-api generate a one-time
 * temporary password (returned once in the response) and flag the account to require a change
 * at next login.
 */
export function adminResetPassword(
  accessToken: string | null | undefined,
  userId: string,
  newPassword?: string,
): Promise<{ temp_password?: string }> {
  return authFetch(`/api/v1/admin/users/${userId}/reset-password`, accessToken, {
    method: 'POST',
    body: JSON.stringify(newPassword ? { new_password: newPassword } : {}),
  });
}

/** Sends the standard self-service password-reset email to the user. */
export function adminSendPasswordResetEmail(accessToken: string | null | undefined, userId: string): Promise<void> {
  return authFetch<void>(`/api/v1/admin/users/${userId}/send-password-reset`, accessToken, { method: 'POST' });
}
