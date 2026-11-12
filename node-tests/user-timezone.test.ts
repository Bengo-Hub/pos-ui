// Screen times follow the signed-in user's zone from /me (src/lib/user-timezone.ts).
// Run from pos-ui/: node --experimental-strip-types --test node-tests/user-timezone.test.ts

import assert from 'node:assert/strict';
import { test } from 'node:test';

const tz = await import('../src/lib/user-timezone.ts');

// 22:30 UTC on 13 Nov is already 14 Nov in Nairobi (UTC+3).
const LATE_UTC = '2026-11-13T22:30:00Z';

test('user zone, then tenant zone, then Africa/Nairobi', () => {
  assert.equal(tz.resolveTimeZone({ profile: { timezone: 'Africa/Lagos' } }, { timezone: 'Europe/London' }), 'Africa/Lagos');
  assert.equal(tz.resolveTimeZone({ profile: { timezone: 'Mars/Olympus' } }, { timezone: 'Europe/London' }), 'Europe/London');
  assert.equal(tz.resolveTimeZone(null, null), 'Africa/Nairobi');
});

test('order and bill times follow the active zone set from /me', () => {
  tz.applyUserTimeZone({ profile: { timezone: 'America/New_York' } }, { timezone: 'Africa/Nairobi' });
  assert.equal(tz.formatTime(LATE_UTC), '17:30');
  assert.equal(tz.formatDate(LATE_UTC), '13 Nov 2026');
  tz.setActiveTimeZone('Africa/Nairobi');
  assert.equal(tz.formatTime(LATE_UTC), '01:30');
  assert.equal(tz.formatDate(LATE_UTC), '14 Nov 2026');
});

test('caller parts replace the defaults', () => {
  assert.equal(
    tz.formatDateTime(LATE_UTC, 'Africa/Nairobi', { locale: 'en-US', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    'Nov 14, 01:30 AM',
  );
});

test('empty input and calendar days', () => {
  assert.equal(tz.formatTime(''), '');
  assert.equal(tz.formatDate('2026-11-20', 'America/New_York'), '20 Nov 2026');
});
