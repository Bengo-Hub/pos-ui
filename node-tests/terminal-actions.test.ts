// Which tenders the till shows for the gateways treasury reports (src/lib/pos/terminal-actions.ts).
// Run from pos-ui/: node --experimental-strip-types --test node-tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentActionsFor } from '../src/lib/pos/terminal-actions.ts';

const keys = (g: Parameters<typeof paymentActionsFor>[1], opts: Parameters<typeof paymentActionsFor>[2] = {}) =>
  paymentActionsFor('hospitality', g, opts).map((a) => a.key);

test('no gateways: only cash, PDQ and split (nothing treasury-backed flashes on)', () => {
  assert.deepEqual(keys({}), ['cash', 'card_pdq', 'split']);
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

test('offline: gateway tenders drop, cash, PDQ and split stay', () => {
  const k = keys({ mpesa: true, mpesa_c2b: true, paystack: true }, { isOnline: false });
  assert.deepEqual(k, ['cash', 'card_pdq', 'split']);
});
