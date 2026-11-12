// Refund-method policy for returns (src/lib/returns-policy.ts), mirroring pos-api.
// Run from pos-ui/: node --experimental-strip-types --test node-tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedRefundChannels, originalRefundChannel, refundChannelForMethod, refundChannelToSend } from '../src/lib/returns-policy.ts';

test('a refund goes back the way the payment came in (pos-api RefundChannelForMethod)', () => {
  const cases: Record<string, string> = {
    cash: 'cash', mpesa_manual: 'mpesa_manual', manual: 'mpesa_manual', mpesa_stk: 'mpesa', mpesa: 'mpesa',
    room_charge: 'room_folio',
    mtn_momo_manual: 'mtn_momo_manual', airtel_money_manual: 'airtel_money_manual',
    other_manual: 'other_manual', card_manual: 'card_manual', pdq: 'card_manual',
    bank_transfer: 'bank', cheque: 'cheque', '': 'cash', unknown: 'cash',
  };
  for (const [method, want] of Object.entries(cases)) {
    assert.equal(refundChannelForMethod(method), want, method);
  }
});

test('the original method is the completed money tender that carried the most', () => {
  const pays = [
    { status: 'completed', amount: 30, tender_type: 'cash', payment_data: { method: 'cash' } },
    { status: 'completed', amount: 70, tender_type: '', payment_data: { method: 'airtel_money_manual' } },
    { status: 'voided', amount: 500, tender_type: 'mpesa_manual', payment_data: { method: 'mpesa_manual' } },
    { status: 'completed', amount: 900, tender_type: 'on_account', payment_data: { method: 'on_account' } },
  ];
  assert.equal(originalRefundChannel(pays), 'airtel_money_manual');
  assert.equal(originalRefundChannel([{ status: 'completed', amount: 10, tender_type: 'mtn_momo_manual' }]), 'mtn_momo_manual');
  assert.equal(originalRefundChannel([]), null);
  assert.equal(originalRefundChannel(undefined), null);
});

test('MTN and Airtel refunds show where the outlet takes them or the sale was paid that way', () => {
  const values = (o: Parameters<typeof allowedRefundChannels>[3]) =>
    allowedRefundChannels('changed_mind', false, true, o).map((c) => c.value);

  const kenyaOnly = values({ settings: {}, original: 'mpesa' });
  assert.ok(!kenyaOnly.includes('mtn_momo_manual') && !kenyaOnly.includes('airtel_money_manual'));
  assert.ok(kenyaOnly.includes('mpesa') && kenyaOnly.includes('other_manual') && kenyaOnly.includes('card_manual'));

  assert.ok(values({ settings: { mtn_momo_number: '0770000000' }, original: 'cash' }).includes('mtn_momo_manual'));
  assert.ok(values({ settings: {}, original: 'airtel_money_manual' }).includes('airtel_money_manual'));

  // Without options (older callers) every channel stays available, as before.
  assert.ok(allowedRefundChannels('changed_mind', false).some((c) => c.value === 'mtn_momo_manual'));
});

test('M-Pesa code and room folio channels are offered only when the sale was paid that way', () => {
  const values = (original: string | null) =>
    allowedRefundChannels('changed_mind', false, true, { settings: {}, original }).map((c) => c.value);
  assert.ok(values('mpesa_manual').includes('mpesa_manual'));
  assert.ok(!values('cash').includes('mpesa_manual'));
  assert.ok(values('room_folio').includes('room_folio'));
  assert.ok(!values('mpesa').includes('room_folio'));
});

test('the cashier pick wins; otherwise the original is sent once known, and nothing before that', () => {
  assert.equal(refundChannelToSend('', null), undefined);
  assert.equal(refundChannelToSend('', 'mtn_momo_manual'), 'mtn_momo_manual');
  assert.equal(refundChannelToSend('cash', 'mtn_momo_manual'), 'cash');
});
