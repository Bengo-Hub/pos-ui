// Which tenders the till shows for the gateways treasury reports (src/lib/pos/terminal-actions.ts).
// Run from pos-ui/: node --experimental-strip-types --test node-tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  paymentActionsFor, tenderMethodFor, isImmediateTender, isValidManualCode, isValidPaymentLabel,
  manualCodePayToLine,
} from '../src/lib/pos/terminal-actions.ts';

const keys = (g: Parameters<typeof paymentActionsFor>[1], opts: Parameters<typeof paymentActionsFor>[2] = {}) =>
  paymentActionsFor('hospitality', g, opts).map((a) => a.key);

const ALWAYS_ON = ['cash', 'card_pdq', 'mpesa_code', 'mtn_momo_code', 'airtel_money_code', 'other_manual', 'split'];

test('no gateways: only the always-on tenders and split (nothing treasury-backed flashes on)', () => {
  assert.deepEqual(keys({}), ALWAYS_ON);
});

// Since aec5139 the paybill is one of PayHero's rails inside a single PayHero tender, not a
// separate "paybill_offline" button.
test('M-Pesa on PayHero (urban-loft): STK push and one PayHero tender carrying the paybill, no Daraja C2B', () => {
  const k = keys({ mpesa: true, mpesa_c2b: false, payhero: true, payhero_methods: ['mpesa', 'payhero_offline'] });
  assert.ok(k.includes('mpesa_stk'));
  assert.ok(k.includes('payhero'));
  assert.ok(!k.includes('paybill_offline'));
  assert.ok(!k.includes('mpesa_c2b'));
});

test('M-Pesa on Daraja: STK push and C2B', () => {
  const k = keys({ mpesa: true, mpesa_c2b: true });
  assert.ok(k.includes('mpesa_stk'));
  assert.ok(k.includes('mpesa_c2b'));
});

test('room charge only when the caller allows it (plan has hotel_module)', () => {
  assert.ok(keys({}, { isHospitality: true }).includes('room'));
  assert.ok(!keys({}, { isHospitality: false }).includes('room'));
});

test('offline: gateway tenders drop, the manual code tenders stay', () => {
  const k = keys({ mpesa: true, mpesa_c2b: true, paystack: true }, { isOnline: false });
  assert.deepEqual(k, ALWAYS_ON);
});

test('manual tenders map to their pos-api methods and settle at once', () => {
  assert.equal(tenderMethodFor('mpesa_code'), 'mpesa_manual');
  assert.equal(tenderMethodFor('mtn_momo_code'), 'mtn_momo_manual');
  assert.equal(tenderMethodFor('airtel_money_code'), 'airtel_money_manual');
  assert.equal(tenderMethodFor('other_manual'), 'other_manual');
  for (const k of ['mpesa_code', 'mtn_momo_code', 'airtel_money_code', 'other_manual'] as const) {
    assert.ok(isImmediateTender(k), k);
  }
});

test('MTN and Airtel codes follow the pos-api format; M-Pesa only needs a code', () => {
  assert.ok(isValidManualCode('mtn_momo_manual', ' ab12cd34 '));
  assert.ok(isValidManualCode('airtel_money_manual', 'CI251111.1530.A12345'));
  assert.ok(!isValidManualCode('mtn_momo_manual', 'ABC12'));
  assert.ok(!isValidManualCode('airtel_money_manual', '-ABC123'));
  assert.ok(!isValidManualCode('airtel_money_manual', 'ABC 123'));
  assert.ok(!isValidManualCode('mtn_momo_manual', 'A'.repeat(31)));
  assert.ok(isValidManualCode('mpesa_manual', 'qb2'));
  assert.ok(!isValidManualCode('mpesa_manual', '  '));
});

test('Other needs a 2 to 40 character label', () => {
  assert.ok(isValidPaymentLabel('Equity cheque'));
  assert.ok(!isValidPaymentLabel(' A '));
  assert.ok(!isValidPaymentLabel('x'.repeat(41)));
});

test('capture step shows the outlet MTN or Airtel number when set', () => {
  assert.equal(manualCodePayToLine('mtn_momo_manual', { mtn_momo_number: '0772000000' }), 'Customer pays MTN 0772000000');
  assert.equal(manualCodePayToLine('airtel_money_manual', { airtel_money_number: '0752000000' }), 'Customer pays Airtel 0752000000');
  assert.equal(manualCodePayToLine('mtn_momo_manual', {}), null);
  assert.equal(manualCodePayToLine('mpesa_manual', { mtn_momo_number: '0772000000' }), null);
});
