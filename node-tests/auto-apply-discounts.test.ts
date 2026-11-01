import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

register('./alias-hooks.mjs', import.meta.url);
const { computePairAutoAdd } = await import('../src/lib/pos/auto-apply-discounts.ts');

// Urban Loft "Pizza Bogo" (2026-11-01): each large maps to itself, "buy one large get the same
// large free". Ringing one large must auto-add one free large; before the fix the self-pair
// needed two paid larges and counted the paid one as the free one, so nothing was ever added.
const pizzaBogo = {
  id: 'p', name: 'Pizza Bogo', promo_kind: 'happy_hour', auto_apply: true, status: 'active', start_at: '2026-07-12T07:58:10Z',
  rule: {
    discount_type: 'bogo', scope_type: 'item', scope_ids: ['PIZ009'], get_scope_ids: ['PIZ009'],
    get_pair_map: { PIZ009: 'PIZ009' }, buy_quantity: 1, get_quantity: 1, get_discount_percent: 100, discount_value: 0,
  },
} as any;
// The everyday cross pair: a large earns its matching small.
const largeForSmall = {
  id: 'q', name: 'Large gets small', promo_kind: 'auto', auto_apply: true, status: 'active', start_at: '2026-07-01T00:00:00Z',
  rule: {
    discount_type: 'bogo', scope_type: 'item', scope_ids: ['PIZ003'], get_scope_ids: ['PIZ001'],
    get_pair_map: { PIZ003: 'PIZ001' }, buy_quantity: 1, get_quantity: 1, get_discount_percent: 100, discount_value: 0,
  },
} as any;

// The till resolves the (lowercased) SKU against its catalog case-insensitively.
const resolve = (sku: string) => ({ sku: sku.toUpperCase(), name: sku.toUpperCase() });
const line = (sku: string, quantity: number, promoFree = false) => ({ sku, name: sku, quantity, promoFree });

test('one large rung on a self-paired deal auto-adds one free large', () => {
  const r = computePairAutoAdd([line('PIZ009', 1)], [pizzaBogo], resolve);
  assert.equal(r.changed, true);
  assert.deepEqual(r.next.filter((c) => c.promoFree).map((c) => [c.sku, c.quantity]), [['PIZ009', 1]]);
});

test('two larges rung earn two free larges, and the free line follows a reduction', () => {
  let r = computePairAutoAdd([line('PIZ009', 2)], [pizzaBogo], resolve);
  assert.equal(r.next.find((c) => c.promoFree)?.quantity, 2);
  r = computePairAutoAdd([line('PIZ009', 1), line('PIZ009', 2, true)], [pizzaBogo], resolve);
  assert.equal(r.next.find((c) => c.promoFree)?.quantity, 1);
});

test('a cross pair still counts a small the cashier rang themselves', () => {
  const r = computePairAutoAdd([line('PIZ003', 1), line('PIZ001', 1)], [largeForSmall], resolve);
  assert.equal(r.next.some((c) => c.promoFree), false);
});
