/**
 * The device/browser/IP trail pos-api stamps on orders (metadata.client), payments
 * (payment_data.client), shift sessions (metadata.opened_from / closed_from), audit entries
 * (client) and outlet devices (clients). See pos-api internal/platform/clientinfo.
 */

export interface ClientTrail {
  client_id?: string;
  device_name?: string;
  device_kind?: 'desktop' | 'mobile' | 'tablet' | 'unknown' | string;
  os?: string;
  browser?: string;
  user_agent?: string;
  ip?: string;
}

/** A browser seen on an outlet device (POSDevice.metadata.clients). */
export interface DeviceClient extends ClientTrail {
  key: string;
  first_seen_at?: string;
  last_seen_at?: string;
  last_user_id?: string;
  last_user_name?: string;
}

/** Offline-sale origin block on an order (metadata.offline). */
export interface OfflineOrigin {
  rung_up_by_user_id?: string;
  rung_up_by_name?: string;
  rung_up_by_verified?: boolean;
  rung_up_on?: ClientTrail;
  synced_by_user_id?: string;
  synced_at?: string;
  offline_created_at?: string;
}

const KIND_LABEL: Record<string, string> = { desktop: 'Desktop', mobile: 'Phone', tablet: 'Tablet' };

export function kindLabel(kind?: string): string {
  return (kind && KIND_LABEL[kind]) || 'Unknown device';
}

/** "Chrome 138 on Android" */
export function browserLabel(t?: ClientTrail | null): string {
  if (!t) return '';
  return [t.browser, t.os].filter(Boolean).join(' on ');
}

/** The best short name: the set device name, else "Phone · Chrome 155 on Android". */
export function deviceLabel(t?: ClientTrail | null): string {
  if (!t) return '';
  if (t.device_name) return t.device_name;
  const b = browserLabel(t);
  if (!t.device_kind && !b) return '';
  return b ? `${kindLabel(t.device_kind)} · ${b}` : kindLabel(t.device_kind);
}

export function shortClientId(id?: string): string {
  return id ? id.slice(0, 8) : '';
}

export function asTrail(v: unknown): ClientTrail | null {
  return v && typeof v === 'object' ? (v as ClientTrail) : null;
}
