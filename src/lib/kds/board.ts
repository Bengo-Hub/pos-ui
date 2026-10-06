// KDS board logic: which channel a ticket belongs to, what the board shows for a station and
// channel, and the counts on every chip and tab. The page renders only what this returns, so a
// count is always exactly the number of cards that chip or tab would show.
// Kept free of React and path aliases so node tests can import it directly.

/** How an order reaches the customer. pos-api computes it (orderchannel) and sends it as `channel`. */
export type KDSChannel =
  | 'dine_in'
  | 'takeaway'
  | 'delivery'
  | 'room_service'
  | 'bar_tab'
  | 'online_pickup'
  | 'online_delivery'
  | 'service_job'
  | 'retail';

export type ChannelFilter = 'all' | KDSChannel;

/** Board chips in display order. The online channels sit next to their in-house counterparts. */
export const KDS_CHANNELS: { key: KDSChannel; label: string }[] = [
  { key: 'dine_in', label: 'Dine-in' },
  { key: 'takeaway', label: 'Takeaway' },
  { key: 'online_pickup', label: 'Online pickup' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'online_delivery', label: 'Online delivery' },
  { key: 'room_service', label: 'Room service' },
  { key: 'bar_tab', label: 'Bar tab' },
  { key: 'retail', label: 'Retail' },
  { key: 'service_job', label: 'Job' },
];

const CHANNEL_KEYS = new Set<string>(KDS_CHANNELS.map((c) => c.key));

export function channelLabel(channel: KDSChannel): string {
  return KDS_CHANNELS.find((c) => c.key === channel)?.label ?? channel;
}

/** The ticket fields the board logic reads. */
export interface BoardTicket {
  id: string;
  order_id: string;
  station_id: string;
  status: string;
  priority: number;
  received_at: string;
  channel?: string;
  order_source?: string;
  order_subtype?: string;
}

export interface BoardStation {
  id: string;
  is_active: boolean;
  sort_order: number;
}

const ACTIVE_STATUSES = new Set(['pending', 'in_progress', 'ready']);

export function isActiveTicket(t: BoardTicket): boolean {
  return ACTIVE_STATUSES.has(t.status);
}

/**
 * The ticket's channel. pos-api sends `channel`; for a ticket from an older server it is derived
 * the same way pos-api does it (online pickup vs delivery by subtype, else the POS subtype).
 */
export function ticketChannel(t: BoardTicket): KDSChannel {
  if (t.channel && CHANNEL_KEYS.has(t.channel)) return t.channel as KDSChannel;
  const subtype = t.order_subtype || 'dine_in';
  if (t.order_source === 'online') return subtype === 'delivery' ? 'online_delivery' : 'online_pickup';
  return CHANNEL_KEYS.has(subtype) ? (subtype as KDSChannel) : 'dine_in';
}

/** Oldest first within priority, the order a kitchen works a rail. */
export function sortTickets<T extends BoardTicket>(tickets: T[]): T[] {
  return [...tickets].sort(
    (a, b) => a.priority - b.priority || new Date(a.received_at).getTime() - new Date(b.received_at).getTime(),
  );
}

export function activeStations<S extends BoardStation>(stations: S[]): S[] {
  return stations.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order);
}

export interface ChannelChip {
  key: ChannelFilter;
  label: string;
  count: number;
}

export interface BoardView<T extends BoardTicket> {
  /** Tickets shown on the grid: active, at the station, in the channel, in rail order. */
  tickets: T[];
  /** Chips for the station being viewed: All plus every channel that has tickets there (and the
   *  selected one even when it has none, so the selection never disappears). */
  chips: ChannelChip[];
  /** Active tickets per station within the selected channel, keyed by station id. */
  stationCounts: Record<string, number>;
}

/**
 * Everything the board renders for one station and channel, from one ticket list.
 * stationId null means no station is selected (no stations configured): the board then covers
 * every ticket.
 */
export function buildBoard<T extends BoardTicket>(
  allTickets: T[],
  stationId: string | null,
  channel: ChannelFilter,
): BoardView<T> {
  const active = allTickets.filter(isActiveTicket);
  const inChannel = (t: T) => channel === 'all' || ticketChannel(t) === channel;

  const stationCounts: Record<string, number> = {};
  for (const t of active) {
    if (inChannel(t)) stationCounts[t.station_id] = (stationCounts[t.station_id] ?? 0) + 1;
  }

  const atStation = stationId ? active.filter((t) => t.station_id === stationId) : active;
  const perChannel = new Map<KDSChannel, number>();
  for (const t of atStation) {
    const c = ticketChannel(t);
    perChannel.set(c, (perChannel.get(c) ?? 0) + 1);
  }
  const chips: ChannelChip[] = [{ key: 'all', label: 'All', count: atStation.length }];
  for (const c of KDS_CHANNELS) {
    const count = perChannel.get(c.key) ?? 0;
    if (count > 0 || channel === c.key) chips.push({ key: c.key, label: c.label, count });
  }

  return { tickets: sortTickets(atStation.filter(inChannel)), chips, stationCounts };
}
