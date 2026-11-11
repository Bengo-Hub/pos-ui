// How the till recognises "this loyalty account was merged into another" (src/lib/pos/loyalty-merged.ts).
// Run from pos-ui/: node --experimental-strip-types --test node-tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergedLoyaltySurvivor, nextLoyaltyAccountId, LOYALTY_ACCOUNT_MERGED_CODE } from '../src/lib/pos/loyalty-merged.ts';

const survivor = '6f1f9a52-7a83-4b55-9e2a-0d3c3f4f2a11';
const shell = '0b0c4f6e-5e1c-4d77-8b1f-7f4f3c2a9d10';

test('a 409 with the merged code gives the survivor and the shell', () => {
  const err = { response: { status: 409, data: { code: LOYALTY_ACCOUNT_MERGED_CODE, account_id: shell, survivor_account_id: survivor } } };
  assert.deepEqual(mergedLoyaltySurvivor(err), { shellId: shell, survivorId: survivor });
});

test('other errors are not a merge', () => {
  assert.equal(mergedLoyaltySurvivor(null), null);
  assert.equal(mergedLoyaltySurvivor(new Error('boom')), null);
  assert.equal(mergedLoyaltySurvivor({ response: { status: 422, data: { error: 'insufficient points balance' } } }), null);
  assert.equal(mergedLoyaltySurvivor({ response: { status: 409, data: { error: 'customer already registered' } } }), null);
  assert.equal(mergedLoyaltySurvivor({ response: { status: 409, data: { code: LOYALTY_ACCOUNT_MERGED_CODE } } }), null);
});

test('the till swaps only the account that was merged', () => {
  const merged = { shellId: shell, survivorId: survivor };
  assert.equal(nextLoyaltyAccountId(shell, merged), survivor);
  assert.equal(nextLoyaltyAccountId('someone-else', merged), null);
  assert.equal(nextLoyaltyAccountId('', merged), null);
});
