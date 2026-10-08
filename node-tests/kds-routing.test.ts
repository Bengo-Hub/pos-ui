// Till-side KDS station routing (src/lib/kds/routing.ts), the mirror of pos-api kdsroute.
// Run from pos-ui/: node --experimental-strip-types --test node-tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeLinesToStations, normaliseCategoryKey, isHotBeverage } from '../src/lib/kds/routing.ts';

type St = Parameters<typeof routeLinesToStations>[1][number];
const st = (id: string, type: St['station_type'], sort: number, filter: string[], routes?: string[]): St => ({
  id, name: id, station_type: type, sort_order: sort, is_active: true, category_filter: filter, category_routes: routes,
});
const owner = (stations: St[], line: { name: string; category?: string; kdsStationId?: string }) => {
  const out = routeLinesToStations([{ quantity: 1, ...line }], stations);
  return [...out.keys()];
};

test('normalised keys match pos-api kdsroute.Key', () => {
  const same = [
    ['Coffees', 'Coffee'], ['Freakyshakes', 'Freaky Shakes'], ['Burger', 'Burgers'],
    ['Sandwich', 'Sandwiches'], ['Beers & Ciders', 'beers and ciders'], ['Glass', 'Glasses'],
  ];
  for (const [a, b] of same) assert.equal(normaliseCategoryKey(a), normaliseCategoryKey(b), `${a} vs ${b}`);
  assert.notEqual(normaliseCategoryKey('Teas'), normaliseCategoryKey('Tequila'));
  assert.equal(normaliseCategoryKey('Rosé Wines'), 'roséwine');
});

test('renamed and nested drinks categories reach the bar (2026-10 urban-loft)', () => {
  const stations = [
    st('kitchen', 'kitchen', 0, ['Main Dishes'], ['Main Dishes', 'Kids Corner']),
    st('bar', 'bar', 1, ['Coffees', 'Wines', 'Freakyshakes'], ['Coffee', 'Iced Coffee', 'Wines', 'Red Wines', 'House Wine', 'Freaky Shakes']),
  ];
  assert.deepEqual(owner(stations, { name: 'Americano', category: 'Coffee' }), ['bar']);
  assert.deepEqual(owner(stations, { name: 'Merlot', category: 'House Wine' }), ['bar']);
  assert.deepEqual(owner(stations, { name: 'Oreo Shake', category: 'Freaky Shakes' }), ['bar']);
  assert.deepEqual(owner(stations, { name: 'Schnitzel', category: 'Kids Corner' }), ['kitchen']);
});

test('without server coverage the filter still matches by normalised name', () => {
  const stations = [st('kitchen', 'kitchen', 0, ['Main Dishes']), st('bar', 'bar', 1, ['Coffees', 'Teas'])];
  assert.deepEqual(owner(stations, { name: 'Latte', category: 'Coffee' }), ['bar']);
  assert.deepEqual(owner(stations, { name: 'Mixed Tea', category: 'Teas' }), ['bar']);
});

test('pins win only for a live station of this outlet', () => {
  const stations = [st('kitchen', 'kitchen', 0, ['Teas']), st('bar', 'bar', 1, [])];
  assert.deepEqual(owner(stations, { name: 'Mixed Tea', category: 'Teas', kdsStationId: 'bar' }), ['bar']);
  assert.deepEqual(owner(stations, { name: 'Mixed Tea', category: 'Teas', kdsStationId: 'other-outlet' }), ['kitchen']);
});

test('hot-beverage guess only when nothing claims the item; fallback follows sort order', () => {
  const stations = [st('bar', 'bar', 2, ['Cocktails']), st('kitchen', 'kitchen', 1, ['Main Dishes'])];
  assert.deepEqual(owner(stations, { name: 'Cappuccino' }), ['kitchen']);
  assert.deepEqual(owner(stations, { name: 'Dog Food', category: 'Dog Food' }), ['kitchen']);
  assert.equal(isHotBeverage('Iced Coffee', ''), false);
  assert.equal(isHotBeverage('Iced Coffee Latte', ''), true); // same as the server: latte still counts
});

test('unclaimed items copy to expo/all stations', () => {
  const stations = [st('kitchen', 'kitchen', 0, ['Main Dishes']), st('expo', 'expo', 1, ['Cocktails'])];
  assert.deepEqual(owner(stations, { name: 'Mojito', category: 'Cocktails' }), ['expo']);
});
