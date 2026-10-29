// Variant rules for the till (src/lib/pos/variants.ts): the cart line is the child item.
// Run from pos-ui/: node --experimental-strip-types --test node-tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  axisValues,
  findVariant,
  findVariantByScanCode,
  variantAxes,
  variantLabel,
  variantLineItem,
  variantLineName,
} from '../src/lib/pos/variants.ts';

const red_m = { id: 'child-red-m', sku: 'TSHIRT-RED-M', name: 'T-shirt, Red / M', price: 1200, barcode: '6161000000017', onHand: 3, attributes: { size: 'M', colour: 'Red' } };
const blue_l = { id: 'child-blue-l', sku: 'TSHIRT-BLUE-L', name: 'T-shirt, Blue / L', price: 1300, attributes: { size: 'L', colour: 'Blue' } };
const parent = {
  id: 'parent', name: 'T-shirt', sku: 'TSHIRT', price: 0, category: 'Clothes',
  minSellingPrice: 900, maxSellingPrice: 1000, stockQuantity: 0, hasVariants: true, variants: [red_m, blue_l],
};

test('axes order colour before size; values keep their order', () => {
  assert.deepEqual(variantAxes([red_m, blue_l]), ['colour', 'size']);
  assert.deepEqual(axisValues([red_m, blue_l], 'colour'), ['Red', 'Blue']);
  assert.equal(findVariant([red_m, blue_l], { colour: 'Blue', size: 'L' })?.id, 'child-blue-l');
  assert.equal(variantLabel(red_m), 'Red / M');
});

test('the cart line is the child item: real id, own price, stock, no parent limits', () => {
  const line = variantLineItem(parent as never, red_m);
  assert.equal(line.id, 'child-red-m', 'never the old "<item>::<variant>" id pos-api rejected');
  assert.equal(line.sku, 'TSHIRT-RED-M');
  assert.equal(line.price, 1200);
  assert.equal(line.stockQuantity, 3);
  assert.equal(line.minSellingPrice, undefined);
  assert.equal(line.maxSellingPrice, undefined);
  assert.equal(line.hasVariants, false);
  assert.equal(line.name, 'T-shirt, Red / M', 'no doubled product name');
});

test('line name adds the product only when the variant name lacks it', () => {
  assert.equal(variantLineName({ name: 'Cap' }, { id: 'x', sku: 'C1', name: 'Large', price: 1, attributes: { size: 'L' } }), 'Cap, L');
});

test('a scanned variant barcode or SKU finds its parent and variant', () => {
  const hit = findVariantByScanCode([parent as never], ' 6161000000017 ');
  assert.equal(hit?.variant.id, 'child-red-m');
  assert.equal(findVariantByScanCode([parent as never], 'tshirt-blue-l')?.variant.id, 'child-blue-l');
  assert.equal(findVariantByScanCode([parent as never], 'nothing'), undefined);
});
