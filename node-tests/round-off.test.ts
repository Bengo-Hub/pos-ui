// The till rounds the payable exactly as pos-api orders.finalizeTotals does, per the tenant's
// central tax setting (treasury round_off and round_off_step). Order 000173 on codevertex-demo
// (2026-11-13): 4,384.00 less a 243.20 deal is 4,140.80.
//
// Run from pos-ui/: node --experimental-strip-types --test node-tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRoundOff } from '../src/lib/pos/cart-tax.ts';

test('default (no setting) rounds up to a whole shilling', () => {
  assert.deepEqual(applyRoundOff(4140.8), { roundOff: 0.2, total: 4141 });
});

test('every policy matches the server', () => {
  const cases: Array<[string, number, number, number]> = [
    ['none', 1, 4140.8, 0],
    ['nearest', 1, 4141, 0.2],
    ['nearest', 5, 4140, -0.8],
    ['up', 5, 4145, 4.2],
    ['up', 10, 4150, 9.2],
    ['bogus', 0, 4141, 0.2],
  ];
  for (const [mode, step, total, roundOff] of cases) {
    assert.deepEqual(applyRoundOff(4140.8, { mode, step }), { roundOff, total }, `${mode}/${step}`);
  }
});
