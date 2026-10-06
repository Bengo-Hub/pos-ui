// KDS board grouping and counts (src/lib/kds/board.ts).
// Run from pos-ui/: node --experimental-strip-types --test node-tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoard, ticketChannel, activeStations } from '../src/lib/kds/board.ts';

let n = 0;
const ticket = (station: string, channel: string, extra: Record<string, unknown> = {}) => ({
  id: `t${++n}`,
  order_id: `o${n}`,
  station_id: station,
  status: 'pending',
  priority: 0,
  received_at: new Date(2026, 9, 6, 12, n).toISOString(),
  channel,
  ...extra,
});

// The screenshot case: two takeaways and four dine-ins at the kitchen, nothing at the bar, plus
// served and voided tickets that must never be counted.
const tickets = [
  ticket('kitchen', 'takeaway'),
  ticket('kitchen', 'takeaway'),
  ticket('kitchen', 'dine_in'),
  ticket('kitchen', 'dine_in'),
  ticket('kitchen', 'dine_in'),
  ticket('kitchen', 'dine_in'),
  ticket('kitchen', 'dine_in', { status: 'served' }),
  ticket('bar', 'takeaway', { status: 'voided' }),
  ticket('bar', 'online_pickup'),
];

test('chip counts equal the cards each chip shows', () => {
  const view = buildBoard(tickets, 'kitchen', 'all');
  const chips = Object.fromEntries(view.chips.map((c) => [c.key, c.count]));
  assert.deepEqual(chips, { all: 6, dine_in: 4, takeaway: 2 });
  for (const chip of view.chips) {
    assert.equal(buildBoard(tickets, 'kitchen', chip.key).tickets.length, chip.count, `chip ${chip.key}`);
  }
});

test('station counts follow the selected channel and ignore finished tickets', () => {
  assert.deepEqual(buildBoard(tickets, 'kitchen', 'all').stationCounts, { kitchen: 6, bar: 1 });
  assert.deepEqual(buildBoard(tickets, 'kitchen', 'takeaway').stationCounts, { kitchen: 2 });
  assert.deepEqual(buildBoard(tickets, 'kitchen', 'online_pickup').stationCounts, { bar: 1 });
});

test('a selected channel with no tickets keeps its chip at zero', () => {
  const view = buildBoard(tickets, 'kitchen', 'online_delivery');
  assert.equal(view.tickets.length, 0);
  assert.deepEqual(view.chips.find((c) => c.key === 'online_delivery'), { key: 'online_delivery', label: 'Online delivery', count: 0 });
});

test('tickets run oldest first within priority', () => {
  const rush = ticket('kitchen', 'dine_in', { priority: -1 });
  const view = buildBoard([...tickets, rush], 'kitchen', 'dine_in');
  assert.equal(view.tickets[0].id, rush.id);
  const rest = view.tickets.slice(1).map((t) => t.received_at);
  assert.deepEqual(rest, [...rest].sort());
});

test('no station selected covers every station', () => {
  assert.equal(buildBoard(tickets, null, 'all').tickets.length, 7);
});

test('older servers without channel are classified like pos-api', () => {
  assert.equal(ticketChannel({ ...ticket('k', ''), channel: undefined, order_source: 'online', order_subtype: 'delivery' }), 'online_delivery');
  assert.equal(ticketChannel({ ...ticket('k', ''), channel: undefined, order_source: 'online', order_subtype: 'takeaway' }), 'online_pickup');
  assert.equal(ticketChannel({ ...ticket('k', ''), channel: undefined, order_source: 'pos', order_subtype: 'takeaway' }), 'takeaway');
  assert.equal(ticketChannel({ ...ticket('k', ''), channel: undefined }), 'dine_in');
});

test('only active stations, in sort order', () => {
  const st = activeStations([
    { id: 'b', is_active: true, sort_order: 2 },
    { id: 'x', is_active: false, sort_order: 0 },
    { id: 'a', is_active: true, sort_order: 1 },
  ]);
  assert.deepEqual(st.map((s) => s.id), ['a', 'b']);
});
