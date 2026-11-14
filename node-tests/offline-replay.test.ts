// Retry rules for the offline replay queues (src/lib/sync/replay-status.ts), S2-20 M-4.
// Run from pos-ui/: node --experimental-strip-types --test node-tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTerminalReplayStatus, nextRetryState, isRetryReady, MAX_SYNC_ATTEMPTS,
} from '../src/lib/sync/replay-status.ts';

test('a 400 replay (room charge with no room) is permanent, not retried', () => {
  assert.equal(isTerminalReplayStatus(400), true);
  assert.equal(isTerminalReplayStatus(404), true);
  assert.equal(isTerminalReplayStatus(422), true);
});

test('auth, timeout, in-flight and rate-limit 4xx stay retryable', () => {
  for (const s of [401, 403, 408, 409, 429]) assert.equal(isTerminalReplayStatus(s), false, String(s));
});

test('5xx and network errors stay retryable', () => {
  for (const s of [500, 502, 503, 504]) assert.equal(isTerminalReplayStatus(s), false, String(s));
  assert.equal(isTerminalReplayStatus(undefined), false);
  assert.equal(isTerminalReplayStatus('400'), false);
});

test('a terminal failure dead-letters at once and is never picked up again', () => {
  const next = nextRetryState({ attempts: 0 }, 'roomId is required', { terminal: true, now: 0 });
  assert.equal(next.dead_letter, true);
  assert.equal(next.attempts, 1);
  assert.equal(next.sync_error, 'roomId is required');
  assert.equal(isRetryReady({ synced: false, ...next }, Date.now()), false);
});

test('a retryable failure backs off and is retried once the wait passes', () => {
  const now = 1_000_000;
  const next = nextRetryState({ attempts: 0 }, 'Bad Gateway', { now });
  assert.notEqual(next.dead_letter, true);
  const row = { synced: false, ...next };
  assert.equal(isRetryReady(row, now), false);
  assert.equal(isRetryReady(row, now + 5 * 60_000), true);
});

test('retryable failures still dead-letter after the attempt cap', () => {
  const next = nextRetryState({ attempts: MAX_SYNC_ATTEMPTS - 1 }, 'Bad Gateway', { now: 0 });
  assert.equal(next.dead_letter, true);
});
