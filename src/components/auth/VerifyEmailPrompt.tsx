'use client';

import { VerifyEmailBanner, type EmailVerificationState } from '@bengo-hub/shared-ui-lib/auth';
import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/api/client';

/**
 * Routed through pos-api (which proxies on to auth-api's S2S endpoint — see pos-api's
 * PINAuthHandler.proxyEmailCode) rather than calling auth-api directly with the user's own
 * session token. That matters for two reasons: apiClient's existing 401-retry-with-refresh
 * interceptor now covers this call too, and — the reason POS never had this working at all —
 * it works for a terminal/PIN session, whose token is signed with pos-api's own HMAC secret
 * (issuer "pos-terminal"). auth-api has no key to verify that token and would reject it
 * outright with "missing or invalid auth" no matter how fresh it was, which is most of the
 * floor-staff population on POS.
 */
async function postVerify(path: string, body: unknown): Promise<void> {
  const tenantId = useAuthStore.getState().user?.tenant_id;
  if (!tenantId) throw new Error('No active organisation — please sign in again.');
  try {
    await apiClient.post(`/api/v1/${tenantId}/pos${path}`, body);
  } catch (e) {
    const err = e as { response?: { data?: { message?: string; error?: string } } };
    const msg = err.response?.data?.message || err.response?.data?.error || 'Request failed. Please try again.';
    throw new Error(msg);
  }
}

/**
 * Graduated verify-email banner + embedded OTP dialog, wired the same way as inventory-ui and
 * every other back-office app: auth-api computes the enforcement state (mirrored here via
 * pos-api's /auth/me → user.email_verification), the embedded dialog handles send/verify, and
 * a successful verification refetches the service profile so the banner clears.
 */
export function VerifyEmailPrompt() {
  const state = useAuthStore((s) => s.user?.email_verification) as EmailVerificationState | undefined;
  if (!state || state.verified) return null;

  const refetch = async () => {
    await useAuthStore.getState().refreshServicePermissions();
  };

  return (
    <VerifyEmailBanner
      state={state}
      onSendCode={(email) => postVerify('/auth/verify-email/send-code', { email })}
      onVerifyCode={(email, code) => postVerify('/auth/verify-email/verify-code', { email, code })}
      onVerified={refetch}
    />
  );
}
