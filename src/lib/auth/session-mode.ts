import { cookieSessionAllowed } from '@bengo-hub/shared-ui-lib/auth';

/**
 * Whether this page uses the cookie session (fleet plan G11): the build flag
 * NEXT_PUBLIC_COOKIE_SESSION is on and the page is on a *.codevertexafrica.com host. A tenant's
 * custom domain keeps the stored-token flow with the same build. Read on each call, so a test can
 * switch the flag with vi.stubEnv. No store import here: the auth store imports this module.
 *
 * Only sso sign-ins (the back office) move to the cookie. PIN terminal sessions keep storing their
 * pos-api token, so a till still works and syncs offline.
 */
export function cookieMode(): boolean {
  return cookieSessionAllowed(process.env.NEXT_PUBLIC_COOKIE_SESSION);
}
