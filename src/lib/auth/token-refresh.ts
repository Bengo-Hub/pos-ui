/**
 * Access-token refresh for pos-ui, built on the shared cross-tab-safe refresher
 * (@bengo-hub/shared-ui-lib/auth createSessionRefresher). Before spending the refresh token it
 * picks up a newer session another tab saved, tabs take turns refreshing, and an enrolment-only
 * answer counts as signed out. See the shared module for the full story.
 */

import { createSessionRefresher } from '@bengo-hub/shared-ui-lib/auth';
import { useAuthStore } from '@/store/auth';
import { refreshTokens } from '@/lib/auth/api';

/** The persisted store key; also names the cross-tab refresh lock and the storage watcher. */
export const AUTH_STORAGE_KEY = 'pos-auth-storage';

const refreshSession = createSessionRefresher({
  lockName: AUTH_STORAGE_KEY,
  getSession: () => useAuthStore.getState().session,
  reloadSession: () => useAuthStore.persist.rehydrate(),
  saveSession: (session) => useAuthStore.setState({ session }),
  refresh: refreshTokens,
});

/**
 * Returns a usable access token, or null when the session is over (or auth-api could not be
 * reached; callers here already treat both the same way). Pass the token the server just
 * rejected when it is known.
 */
export async function refreshAccessToken(failedToken?: string | null): Promise<string | null> {
  const outcome = await refreshSession(failedToken);
  return 'token' in outcome ? outcome.token : null;
}
