// Automatic customer-copy gate (src/lib/pos/printer-stations.ts), the mirror of pos-api
// printing.AutoBillProfile. Run from pos-ui/: node --experimental-strip-types --test node-tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoPrintsCustomerCopy } from '../src/lib/pos/printer-stations.ts';

const bill = (extra: Record<string, unknown> = {}) => ({ id: 'customer', label: 'Bill', printer_type: 'usb', printer_name: 'Main Cafe Printer', ...extra });

test('card toggle off stops the automatic bill and receipt (urban-loft 2026-10-09)', () => {
  assert.equal(autoPrintsCustomerCopy({ auto_print_order: true, printer_profiles: [bill({ auto_print: false })] as never }), false);
});

test('outlet switch off stops it whatever the card says', () => {
  assert.equal(autoPrintsCustomerCopy({ auto_print_order: false, printer_profiles: [bill({ auto_print: true })] as never }), false);
});

test('both on prints; a card saved without the toggle keeps printing', () => {
  assert.equal(autoPrintsCustomerCopy({ auto_print_order: true, printer_profiles: [bill({ auto_print: true })] as never }), true);
  assert.equal(autoPrintsCustomerCopy({ auto_print_order: true, printer_profiles: [bill()] as never }), true);
});
