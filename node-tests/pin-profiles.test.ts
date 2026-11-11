// The PIN picker's payloads and offline cache merge after the switch to staff ids
// (src/lib/offline/staff-profile-merge.ts). The public profile list no longer carries user ids
// or roles, so nothing here may depend on them.
// Run from pos-ui/: node --experimental-strip-types --test node-tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pinLoginBody, mergePinProfiles, cacheRowFromLogin, pinHashAfterPermissionRefresh, type PinProfileListItem,
} from '../src/lib/offline/staff-profile-merge.ts';

const NOW = '2026-11-11T10:00:00.000Z';

test('the PIN login body names the staff id only, never a user id', () => {
  const body = pinLoginBody('staff-1', '4829');
  assert.deepEqual(body, { staff_id: 'staff-1', pin: '4829' });
  assert.equal('user_id' in body, false);
});

test('a profile refresh updates the name of a cached row matched by staff id and keeps everything else', () => {
  const cached = [{
    user_id: 'user-1', staff_id: 'staff-1', tenant_id: 't1', name: 'Old Name', email: 'a@b.c',
    roles: ['cashier'], permissions: ['pos.orders.add'], pin_hash: '$2a$hash', cached_at: '2026-11-01T00:00:00.000Z',
  }];
  const list: PinProfileListItem[] = [{ staff_id: 'staff-1', tenant_id: 't1', name: 'New Name', initials: 'NN', has_pin: true }];
  const out = mergePinProfiles(list, cached, NOW);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { ...cached[0], name: 'New Name', cached_at: NOW });
});

test('a profile refresh never creates rows: only someone who signed in here has a PIN to check offline', () => {
  const list: PinProfileListItem[] = [{ staff_id: 'staff-9', tenant_id: 't1', name: 'Never Signed In', has_pin: true }];
  assert.deepEqual(mergePinProfiles(list, [], NOW), []);
});

test('legacy cached rows without a staff id are left alone until that person signs in online again', () => {
  const legacy = [{ user_id: 'user-1', tenant_id: 't1', name: 'Legacy', email: '', roles: [], permissions: [], pin_hash: 'h', cached_at: 'x' }];
  const list: PinProfileListItem[] = [{ staff_id: 'staff-1', tenant_id: 't1', name: 'Renamed', has_pin: true }];
  assert.deepEqual(mergePinProfiles(list, legacy, NOW), []);
});

test('a row from another tenant is never touched by this tenant\'s list', () => {
  const cached = [{ user_id: 'u', staff_id: 'staff-1', tenant_id: 'other', name: 'Theirs', email: '', roles: [], permissions: [], cached_at: 'x' }];
  const list: PinProfileListItem[] = [{ staff_id: 'staff-1', tenant_id: 't1', name: 'Mine', has_pin: true }];
  assert.deepEqual(mergePinProfiles(list, cached, NOW), []);
});

test('the cache row written after an online login carries the staff id from the login response', () => {
  const row = cacheRowFromLogin({
    user_id: 'user-1', staff_id: 'staff-1', name: 'Till', role: 'cashier', tenant_id: 't1',
    permissions: ['pos.orders.add'], pin_hash: '$2a$hash',
  }, NOW);
  assert.deepEqual(row, {
    user_id: 'user-1', staff_id: 'staff-1', tenant_id: 't1', name: 'Till', email: '',
    roles: ['cashier'], permissions: ['pos.orders.add'], pin_hash: '$2a$hash', cached_at: NOW,
  });
});

test('when the server says the PIN is gone (has_pin false), the cached hash is dropped', () => {
  // pos-api clears a PIN when a role raise happens; the old, possibly manager-known PIN must
  // stop working offline too.
  const cached = [{
    user_id: 'user-1', staff_id: 'staff-1', tenant_id: 't1', name: 'Till', email: '',
    roles: ['cashier'], permissions: [], pin_hash: '$2a$old', cached_at: 'x',
  }];
  const out = mergePinProfiles([{ staff_id: 'staff-1', tenant_id: 't1', name: 'Till', has_pin: false }], cached, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].pin_hash, undefined);
  assert.equal('pin_hash' in out[0], false);
});

test('a refresh that omits has_pin keeps the cached hash', () => {
  const cached = [{
    user_id: 'u', staff_id: 's', tenant_id: 't1', name: 'Till', email: '', roles: [], permissions: [], pin_hash: 'h', cached_at: 'x',
  }];
  const out = mergePinProfiles([{ staff_id: 's', tenant_id: 't1', name: 'Till' }], cached, NOW);
  assert.equal(out[0].pin_hash, 'h');
});

test('the permissions refresher keeps the offline hash only when no new permission was granted', () => {
  const existing = { pin_hash: 'h', permissions: ['pos.orders.add', 'pos.orders.view'] };
  assert.equal(pinHashAfterPermissionRefresh(existing, ['pos.orders.add']), 'h');
  assert.equal(pinHashAfterPermissionRefresh(existing, ['pos.orders.add', 'pos.orders.view']), 'h');
  // A raise: a new grant means the cached PIN may be one a manager chose before the raise.
  assert.equal(pinHashAfterPermissionRefresh(existing, ['pos.orders.add', 'pos.staff.manage']), undefined);
  assert.equal(pinHashAfterPermissionRefresh(undefined, ['pos.orders.add']), undefined);
  assert.equal(pinHashAfterPermissionRefresh({ permissions: [] }, []), undefined);
});

test('no PIN hash in the login response means nothing to cache for offline sign-in', () => {
  assert.equal(cacheRowFromLogin({ user_id: 'u', staff_id: 's', name: 'n', tenant_id: 't' }, NOW), null);
});
