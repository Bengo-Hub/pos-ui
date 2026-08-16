'use client';

/**
 * Tracks whether the last offline-sync drain attempt hit a 401/403 — i.e. the queue has
 * real work to push but the current session can't authenticate it (expired terminal JWT,
 * or the literal offline-PIN placeholder token). Distinct from `effectiveOnline`
 * (connectivity.ts): the network/server is fine here, only auth is the blocker, and it
 * resolves the instant a human re-logs in, not on its own like a network hiccup.
 *
 * 401/403 during sync are retryable (see isTerminal() in use-sync-offline-orders.ts), not
 * dead-lettered — this flag exists purely so the UI can show "waiting for re-login" instead
 * of generic "N items pending" or raw HTTP-status error text while that's true.
 */
import { create } from 'zustand';

interface AuthSyncState {
  blocked: boolean;
  lastBlockedAt: number | null;
}

export const useAuthSyncStore = create<AuthSyncState>(() => ({
  blocked: false,
  lastBlockedAt: null,
}));

export function reportAuthSyncBlocked(): void {
  useAuthSyncStore.setState({ blocked: true, lastBlockedAt: Date.now() });
}

export function reportAuthSyncCleared(): void {
  const s = useAuthSyncStore.getState();
  if (s.blocked) useAuthSyncStore.setState({ blocked: false });
}

export function isAuthSyncBlocked(): boolean {
  return useAuthSyncStore.getState().blocked;
}

export function useAuthSyncBlocked(): boolean {
  return useAuthSyncStore((s) => s.blocked);
}
