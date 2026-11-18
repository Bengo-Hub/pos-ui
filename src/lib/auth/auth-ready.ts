'use client';

/**
 * Holds API requests until the session start-up settles.
 *
 * In cookie mode a reload keeps the profile but no access token: the token comes from the sso
 * cookie refresh in initialize(). Queries mount (and child effects run) before that finishes,
 * so without this every first request went out bare and came back 401. Requests now wait while
 * a known user has no token and auth is still idle or loading, up to MAX_WAIT_MS.
 *
 * Read-only use of the auth store: it never changes auth state or redirects.
 */

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';

const MAX_WAIT_MS = 10_000;

function settled(): boolean {
  if (apiClient.getAccessToken()) return true;
  const s = useAuthStore.getState();
  // Signed out: nothing to wait for. Authenticated without a token is the offline path.
  if (!s.user) return true;
  return s.status !== 'idle' && s.status !== 'loading';
}

let pending: Promise<void> | null = null;

export function waitForAuthReady(): Promise<void> {
  if (settled()) return Promise.resolve();
  if (pending) return pending;
  pending = new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      unsubscribe();
      clearTimeout(timer);
      pending = null;
      resolve();
    };
    const unsubscribe = useAuthStore.subscribe(() => { if (settled()) finish(); });
    const timer = setTimeout(finish, MAX_WAIT_MS);
  });
  return pending;
}

let installed = false;

/** Wires the waiter into the API client once. Called from org-shell. */
export function installAuthReadyGate() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  apiClient.setAuthReadyWaiter(waitForAuthReady);
}
