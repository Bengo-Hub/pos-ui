// Which tenders the hotel desk offers and what each needs (src/lib/pos/hotel-tenders.ts).
// Run from pos-ui/: node --experimental-strip-types --test node-tests/

import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

register('./alias-hooks.mjs', import.meta.url);
const { hotelTenderKeys, hotelTenderError, hotelTenderNeeds } = await import('../src/lib/pos/hotel-tenders.ts');

test('MTN and Airtel show at the desk only where the outlet has that number; M-Pesa and Other always', () => {
  assert.deepEqual(hotelTenderKeys({}), ['cash', 'card_manual', 'mpesa', 'other_manual']);
  assert.deepEqual(
    hotelTenderKeys({ mtn_momo_number: '0770000000', airtel_money_number: ' ' }),
    ['cash', 'card_manual', 'mpesa', 'mtn_momo_manual', 'other_manual'],
  );
  assert.deepEqual(hotelTenderKeys(null), ['cash', 'card_manual', 'mpesa', 'other_manual']);
});

test('code tenders need a code in the till format, Other needs a label', () => {
  assert.equal(hotelTenderNeeds('mpesa'), 'code');
  assert.equal(hotelTenderNeeds('mtn_momo_manual'), 'code');
  assert.equal(hotelTenderNeeds('other_manual'), 'label');
  assert.equal(hotelTenderNeeds('cash'), 'none');

  assert.equal(hotelTenderError('cash', '', ''), null);
  assert.equal(hotelTenderError('card_manual', '', ''), null);
  assert.match(hotelTenderError('mpesa', ' ', '') ?? '', /M-Pesa/);
  assert.equal(hotelTenderError('mpesa', 'qb234abcde', ''), null);
  assert.match(hotelTenderError('airtel_money_manual', 'AB12', '') ?? '', /Airtel/);
  assert.equal(hotelTenderError('mtn_momo_manual', '12345678901', ''), null);
  assert.match(hotelTenderError('other_manual', '', 'A') ?? '', /how the guest paid/);
  assert.equal(hotelTenderError('other_manual', '', 'Company voucher'), null);
});
