/**
 * Retry rules for the offline replay queues (orders, payments, voids, returns, drawers), kept
 * free of IndexedDB and React so node tests can cover them. lib/db/pos-db.ts re-exports these.
 *
 * Each queued mutation moves through: pending, then synced, retryable or dead. We don't persist
 * an explicit "in-flight" flag (the drain is single-threaded per tab); instead retryable rows
 * carry next_attempt_at (exponential backoff) and terminal rows are marked dead_letter so they
 * stop auto-retrying and surface for manual review (the sync status pill).
 */

export interface SyncState {
  synced: boolean;
  sync_error?: string;
  attempts?: number;
  next_attempt_at?: string; // ISO; do not retry before this time
  dead_letter?: boolean; // terminal failure: stop auto-retrying, needs manual review
}

/** Max auto-retries before a row is dead-lettered. */
export const MAX_SYNC_ATTEMPTS = 8;

/**
 * Whether a replay's HTTP status is a permanent rejection. A 4xx is a validation error that a
 * replay cannot fix (a 400 for a room charge with no room, S2-20 M-4), so the row is dead-lettered
 * and shown to the cashier instead of retried. These 4xx stay retryable:
 *  - 401/403: an expired terminal JWT (or the offline-PIN placeholder token) clears the moment a
 *    human signs in again; dead-lettering a completed sale on it would drop real revenue.
 *  - 408 and 429: timeout and rate limit.
 *  - 409: the same Idempotency-Key is still being processed; a later replay gets the stored result.
 * A 5xx, a network error (no status) and anything else is retryable with backoff.
 */
export function isTerminalReplayStatus(status: unknown): boolean {
  if (typeof status !== 'number') return false;
  if (status < 400 || status >= 500) return false;
  return status !== 401 && status !== 403 && status !== 408 && status !== 409 && status !== 429;
}

/**
 * Compute the next sync-state after a failed attempt. Terminal (4xx validation) failures
 * dead-letter immediately, since replaying won't change the outcome. Retryable (network/5xx)
 * failures back off exponentially with jitter, dead-lettering after MAX_SYNC_ATTEMPTS.
 */
export function nextRetryState(
  current: { attempts?: number },
  error: string,
  opts: { terminal?: boolean; now?: number } = {},
): Pick<SyncState, 'attempts' | 'next_attempt_at' | 'dead_letter' | 'sync_error'> {
  const attempts = (current.attempts ?? 0) + 1;
  const now = opts.now ?? Date.now();
  if (opts.terminal || attempts >= MAX_SYNC_ATTEMPTS) {
    return { attempts, sync_error: error, dead_letter: true, next_attempt_at: undefined };
  }
  // 2^n seconds capped at 5 min, +/- 20% jitter so reconnecting terminals don't sync in lockstep.
  const baseMs = Math.min(2 ** attempts * 1000, 5 * 60_000);
  const jitter = baseMs * (0.8 + ((attempts * 37) % 40) / 100); // deterministic pseudo-jitter
  return { attempts, sync_error: error, next_attempt_at: new Date(now + jitter).toISOString() };
}

/** True when a queued row is eligible to (re)try right now. */
export function isRetryReady(row: SyncState, now = Date.now()): boolean {
  if (row.synced || row.dead_letter) return false;
  if (!row.next_attempt_at) return true;
  return new Date(row.next_attempt_at).getTime() <= now;
}
