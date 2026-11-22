// KDS board grouping and counts (src/lib/kds/board.ts).
// Run from pos-ui/: node --experimental-strip-types --test node-tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoard, ticketChannel, activeStations, chitLabelFor, orderChannel } from '../src/lib/kds/board.ts';

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

test('chit label matches the server chit for every route', () => {
  assert.deepEqual(chitLabelFor({ subtype: 'dine_in' }), { orderType: 'DINE-IN', details: ['Source: POS'] });
  assert.deepEqual(chitLabelFor({ subtype: 'takeaway', customerName: 'Achieng' }), { orderType: 'TAKEAWAY', details: ['Source: POS', 'For: Achieng'] });
  assert.deepEqual(chitLabelFor({ subtype: 'dine_in', customerName: 'Walk in' }).details, ['Source: POS']);
  assert.deepEqual(
    chitLabelFor({ subtype: 'delivery', metadata: { online_order_id: 'x', online_order_no: '000045', fulfillment_type: 'delivery', scheduled_for_label: 'Fri 18:30', order_notes: 'no onions' } }),
    { orderType: 'ONLINE DELIVERY', details: ['Source: Online store #000045', 'Ready by: Fri 18:30', 'Note: no onions'] },
  );
  assert.equal(chitLabelFor({ subtype: 'takeaway', metadata: { online_order_id: 'x' } }).orderType, 'ONLINE PICKUP');
  assert.equal(chitLabelFor({}).orderType, 'DINE-IN');
  assert.equal(orderChannel('room_service', null), 'room_service');
});

test('only active stations, in sort order', () => {
  const st = activeStations([
    { id: 'b', is_active: true, sort_order: 2 },
    { id: 'x', is_active: false, sort_order: 0 },
    { id: 'a', is_active: true, sort_order: 1 },
  ]);
  assert.deepEqual(st.map((s) => s.id), ['a', 'b']);
});

test('day view keeps served and voided tickets after the live rail, newest finished first', () => {
  const live = ticket('bar', 'dine_in');
  const servedOld = { ...ticket('bar', 'dine_in'), status: 'served', completed_at: '2026-11-22T06:00:00Z' };
  const servedNew = { ...ticket('bar', 'takeaway'), status: 'served', completed_at: '2026-11-22T07:00:00Z' };
  const voided = { ...ticket('bar', 'dine_in'), status: 'voided', completed_at: '2026-11-22T05:00:00Z' };
  const all = [servedOld, voided, live, servedNew];

  const day = buildBoard(all, 'bar', 'all', { mode: 'day' });
  assert.deepEqual(day.tickets.map((t) => t.id), [live.id, servedNew.id, servedOld.id, voided.id]);
  assert.equal(day.chips[0].count, 4, 'chips count every card shown');
  assert.equal(day.stationCounts.bar, 1, 'station tabs count work still waiting');

  const hidden = buildBoard(all, 'bar', 'all', { mode: 'day', keepClosed: false });
  assert.deepEqual(hidden.tickets.map((t) => t.id), [live.id]);

  const liveOnly = buildBoard(all, 'bar', 'all');
  assert.deepEqual(liveOnly.tickets.map((t) => t.id), [live.id]);
});
