/**
 * KDS station routing for the till's own ticket printing (offline and agent-less outlets).
 *
 * The server decides routing in pos-api `kdsroute.Router` and stamps the owning station on every
 * order line; this is the same rule for the paper chit the till prints itself, so a line's chit
 * and its KDS screen ticket always land on the same station. Keep the two in step: a fix on one
 * side only (the 2026-08 drift) leaves paper and screens disagreeing.
 */

import type { KDSStation } from '@/hooks/useKDS';

export interface TicketLine {
  name: string;
  quantity: number;
  category?: string;
  notes?: string;
  unitPrice?: number;
  totalPrice?: number;
  /** Explicit per-item KDS routing pin (POSCatalogOverride.kds_station_id, surfaced on the
   *  catalog item as kds_station_id). Wins over category matching while it names a live station
   *  of this outlet, e.g. an ice-cream scoop in a mixed "Kids Corner" category pinned to Bar. */
  kdsStationId?: string;
}

// Last-resort guess only (kdsroute priority 4): an item no station claims that looks like a hot
// drink goes to the kitchen. Never checked ahead of a station's own category claim.
const HOT_BEVERAGES = [
  'coffee', 'tea', 'espresso', 'cappuccino', 'latte', 'americano', 'macchiato',
  'mocha', 'hot chocolate', 'chai', 'flat white', 'cortado', 'affogato', 'hot beverage', 'hot drink',
];

/** Same rule as kdsroute.IsHotBeverage: iced coffee and iced tea do not count as hot. */
export function isHotBeverage(name: string, category: string): boolean {
  const hay = `${name} ${category}`.toLowerCase();
  return HOT_BEVERAGES.some((kw) => {
    if (!hay.includes(kw)) return false;
    if ((kw === 'coffee' || kw === 'tea') && (hay.includes(`iced ${kw}`) || hay.includes(`ice ${kw}`))) return false;
    return true;
  });
}

// Built with RegExp: the ES2017 TS target rejects Unicode property escapes in a literal.
const NON_ALNUM = new RegExp('[^\\p{L}\\p{Nd}]', 'gu');

/**
 * Normalised category key, the same rule as pos-api `kdsroute.Key`: lower case, "&" read as
 * "and", only letters and digits kept, one simple plural folded. "Coffees" and "Coffee",
 * "Freakyshakes" and "Freaky Shakes", "Burger" and "Burgers" all share a key.
 */
export function normaliseCategoryKey(s: string | undefined | null): string {
  let k = (s ?? '').trim().toLowerCase();
  if (!k) return '';
  k = k.replace(/&/g, ' and ').replace(NON_ALNUM, '');
  if (k.length > 4 && /(ches|shes|sses|xes|zes)$/.test(k)) return k.slice(0, -2);
  if (k.length > 3 && k.endsWith('s') && !k.endsWith('ss')) return k.slice(0, -1);
  return k;
}

const isCopyStation = (s: KDSStation) => s.station_type === 'expo' || s.station_type === 'all';

/**
 * Route lines to KDS stations:
 *  1. an explicit per-item pin (`kdsStationId`) wins while it names a live station of this outlet;
 *  2. the line's category claimed by a station: first through the server-expanded
 *     `category_routes` (filter entries plus inherited sub-categories, so "Red Wines" follows a
 *     Bar that claims "Wines"), then the station's own `category_filter`; both compared with
 *     normaliseCategoryKey;
 *  3. a line with no category: a filter name inside the item name (legacy items);
 *  4. nothing claimed it: a hot-beverage name guess goes to the kitchen station;
 *  5. still unrouted: every expo/all station, else the first station by sort order.
 * Returns a Map of stationId to lines.
 */
export function routeLinesToStations(lines: TicketLine[], stations: KDSStation[]): Map<string, TicketLine[]> {
  const active = stations
    .filter((s) => s.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
  const buckets = new Map<string, TicketLine[]>();
  const push = (id: string, l: TicketLine) => {
    const arr = buckets.get(id);
    if (arr) arr.push(l); else buckets.set(id, [l]);
  };
  const expo = active.filter(isCopyStation);
  const kitchen = active.find((s) => s.station_type === 'kitchen');

  // First claim wins, in sort order, exactly like the server.
  const routeClaims = new Map<string, string>();
  const filterClaims = new Map<string, string>();
  for (const s of active) {
    if (isCopyStation(s)) continue;
    for (const c of s.category_routes ?? []) {
      const k = normaliseCategoryKey(c);
      if (k && !routeClaims.has(k)) routeClaims.set(k, s.id);
    }
    for (const c of s.category_filter ?? []) {
      const k = normaliseCategoryKey(c);
      if (k && !filterClaims.has(k)) filterClaims.set(k, s.id);
    }
  }

  for (const l of lines) {
    const cat = normaliseCategoryKey(l.category);
    const name = (l.name ?? '').toLowerCase();
    let routed: string | null = null;

    if (l.kdsStationId && active.some((s) => s.id === l.kdsStationId)) {
      routed = l.kdsStationId;
    } else if (cat) {
      routed = routeClaims.get(cat) ?? filterClaims.get(cat) ?? null;
    } else {
      for (const s of active) {
        if (isCopyStation(s)) continue;
        if ((s.category_filter ?? []).some((c) => {
          const needle = c.trim().toLowerCase();
          return needle !== '' && name.includes(needle);
        })) { routed = s.id; break; }
      }
    }

    if (!routed && kitchen && isHotBeverage(name, l.category ?? '')) {
      routed = kitchen.id;
    }

    if (routed) { push(routed, l); continue; }
    if (expo.length) { expo.forEach((e) => push(e.id, l)); continue; }
    if (active.length) push(active[0].id, l);
  }
  return buckets;
}
