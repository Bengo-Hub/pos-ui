import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bogoFreeUnitsForSku, computeHappyHour, bogoOwners, ownsBuySku } from '../src/lib/pos/happy-hour.ts';

// Urban Loft, 2026-11-01: an everyday "buy a large pizza, get the small free" and a deal set for
// today, "buy one large get one large free", both cover the large. The newest deal owns the large,
// as pos-api promotions.combineTimedDiscounts decides, so the till never frees the small too.
const everyday = {
  id: 'a', name: 'Large gets small free', promo_kind: 'auto', auto_apply: true, status: 'active',
  start_at: '2026-09-01T00:00:00Z',
  rule: {
    discount_type: 'bogo', scope_type: 'item', scope_ids: ['PIZ-L'], get_scope_ids: ['PIZ-S'],
    get_pair_map: { 'PIZ-L': 'PIZ-S' }, buy_quantity: 1, get_quantity: 1, get_discount_percent: 100, discount_value: 0,
  },
} as any;
const today = {
  id: 'b', name: 'Large BOGO today', promo_kind: 'auto', auto_apply: true, status: 'active',
  start_at: '2026-11-01T00:00:00Z',
  rule: {
    discount_type: 'bogo', scope_type: 'item', scope_ids: ['PIZ-L'], buy_quantity: 1, get_quantity: 1,
    get_discount_percent: 100, discount_value: 0,
  },
} as any;

const lines = [
  { sku: 'PIZ-L', unitPrice: 1600, quantity: 2, total: 3200 },
  { sku: 'PIZ-S', unitPrice: 900, quantity: 1, total: 900 },
];

test('the newest deal owns an item two deals cover', () => {
  const owners = bogoOwners([everyday, today]);
  assert.equal(ownsBuySku(today, 'PIZ-L', owners), true);
  assert.equal(ownsBuySku(everyday, 'PIZ-L', owners), false);
});

test("today's deal frees a large, never the everyday small as well", () => {
  const r = computeHappyHour(lines, [everyday, today]);
  assert.equal(r.total, 1600);
  assert.equal(r.bySku['PIZ-S'], undefined);
  assert.equal(r.promoName, 'Large BOGO today');
  assert.equal(bogoFreeUnitsForSku('PIZ-L', 1, [everyday, today]), 1);
});

test('once today ends the everyday deal applies again', () => {
  const r = computeHappyHour(lines, [everyday]);
  assert.equal(r.total, 900);
});

test('deals that started together are not ranked: the better saving wins', () => {
  const half = { ...today, id: 'c', name: 'Half off', start_at: today.start_at, rule: { ...today.rule, get_discount_percent: 50 } };
  const r = computeHappyHour([{ sku: 'PIZ-L', unitPrice: 1600, quantity: 2, total: 3200 }], [half, today]);
  assert.equal(r.total, 1600);
});
