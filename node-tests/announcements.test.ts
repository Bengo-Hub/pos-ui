// The platform announcement banner's selection and link rules (shared-ui-lib announcements).
// Run from pos-ui/: node --experimental-strip-types --test node-tests/*.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnnouncementLink, visibleAnnouncements } from '@bengo-hub/shared-ui-lib/announcements';

const base = { summary: 's', highlights: [], tone: 'feature' as const, priority: 0, starts_at: '', updated_at: '' };
const list = [
  { ...base, id: 'payhero', title: 'PayHero', audience: 'admins' as const, dismissible: true },
  { ...base, id: 'everyone', title: 'Everyone', audience: 'all' as const, dismissible: true },
  { ...base, id: 'pinned', title: 'Pinned', audience: 'all' as const, dismissible: false },
];

test('admin-only announcements are hidden from cashiers', () => {
  assert.deepEqual(visibleAnnouncements(list, [], false).map((a) => a.id), ['everyone', 'pinned']);
  assert.deepEqual(visibleAnnouncements(list, [], true).map((a) => a.id), ['payhero', 'everyone', 'pinned']);
});

test('a dismissed announcement stays hidden; a non-dismissible one cannot be hidden', () => {
  const ids = visibleAnnouncements(list, ['payhero', 'pinned'], true).map((a) => a.id);
  assert.deepEqual(ids, ['everyone', 'pinned']);
});

test('call-to-action links substitute the org slug', () => {
  assert.deepEqual(resolveAnnouncementLink('/{orgSlug}/settings', 'urban-loft'), { href: '/urban-loft/settings', external: false });
  const ext = resolveAnnouncementLink('https://books.codevertexafrica.com/{orgSlug}/settings?tab=payments', 'urban-loft');
  assert.equal(ext.href, 'https://books.codevertexafrica.com/urban-loft/settings?tab=payments');
  assert.equal(ext.external, true);
});
