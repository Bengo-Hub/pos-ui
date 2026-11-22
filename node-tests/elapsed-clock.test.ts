// Elapsed clock YYYY:MM:DD:HH:mm:ss (src/lib/time/elapsed.ts).
// Run from pos-ui/: node --experimental-strip-types --test node-tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elapsedMinutes, formatElapsedClock } from '../src/lib/time/elapsed.ts';

const at = (s: string) => new Date(s).getTime();

test('seconds, minutes and hours pad to the fixed clock', () => {
  assert.equal(formatElapsedClock(at('2026-11-22T08:00:00Z'), at('2026-11-22T08:00:05Z')), '0000:00:00:00:00:05');
  assert.equal(formatElapsedClock(at('2026-11-22T08:00:00Z'), at('2026-11-22T09:23:05Z')), '0000:00:00:01:23:05');
});

test('days, months and years are calendar steps', () => {
  assert.equal(formatElapsedClock(at('2026-11-20T10:00:00Z'), at('2026-11-22T12:30:00Z')), '0000:00:02:02:30:00');
  // 31 Jan + 1 month clamps to 28 Feb, so 1 Mar is one month and one day later.
  assert.equal(formatElapsedClock(at('2026-01-31T00:00:00Z'), at('2026-03-01T00:00:00Z')), '0000:01:01:00:00:00');
  assert.equal(formatElapsedClock(at('2024-11-22T00:00:00Z'), at('2026-12-23T01:02:03Z')), '0002:01:01:01:02:03');
});

test('a start in the future or an invalid date shows zero', () => {
  assert.equal(formatElapsedClock(at('2026-11-22T09:00:00Z'), at('2026-11-22T08:00:00Z')), '0000:00:00:00:00:00');
  assert.equal(formatElapsedClock('not a date', at('2026-11-22T08:00:00Z')), '0000:00:00:00:00:00');
});

test('elapsedMinutes counts whole minutes', () => {
  assert.equal(elapsedMinutes(at('2026-11-22T08:00:00Z'), at('2026-11-22T08:16:59Z')), 16);
});
