/**
 * Per-browser identity sent to pos-api on every request, so audits can tell which phone, tablet
 * or PC an order, payment, sign-in or approval came from. Every browser at an outlet shares the
 * outlet's one "web terminal" device record, so without this two browsers are indistinguishable.
 *
 *  - client id: a random UUID generated once per browser and kept in localStorage.
 *  - device name: an optional label a manager sets on this browser (Settings, Devices tab), e.g.
 *    "Titus's iPhone" or "Front counter PC". When unset the server still records the user
 *    agent, the device kind it implies (desktop, mobile, tablet) and the IP.
 *
 * Header values must be ASCII, so the name travels URI-encoded (pos-api decodes it).
 */

const CLIENT_ID_KEY = 'pos.device.client_id';
const DEVICE_NAME_KEY = 'pos.device.name';
export const DEVICE_NAME_MAX = 60;

let cachedClientId: string | null = null;
let cachedName: string | null | undefined;

function newUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Fallback for older WebViews without randomUUID.
  const b = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Stable id for this browser. Survives reloads; a cleared or blocked storage gets a new one. */
export function getClientId(): string {
  if (cachedClientId) return cachedClientId;
  let id: string | null = null;
  try {
    id = localStorage.getItem(CLIENT_ID_KEY);
  } catch {
    /* storage blocked: fall through to an in-memory id for this page load */
  }
  if (!id) {
    id = newUUID();
    try {
      localStorage.setItem(CLIENT_ID_KEY, id);
    } catch {
      /* ignore */
    }
  }
  cachedClientId = id;
  return id;
}

/** The name set for this browser, or null. */
export function getDeviceName(): string | null {
  if (cachedName !== undefined) return cachedName;
  let name: string | null = null;
  try {
    name = localStorage.getItem(DEVICE_NAME_KEY);
  } catch {
    /* ignore */
  }
  cachedName = name && name.trim() ? name.trim() : null;
  return cachedName;
}

const listeners = new Set<() => void>();

/** Subscribe to device-name changes (for useSyncExternalStore). */
export function subscribeDeviceIdentity(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Saves (or with an empty value, clears) this browser's name. */
export function setDeviceName(name: string): void {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, DEVICE_NAME_MAX);
  cachedName = clean || null;
  try {
    if (clean) localStorage.setItem(DEVICE_NAME_KEY, clean);
    else localStorage.removeItem(DEVICE_NAME_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn());
}

/** Headers identifying this browser to pos-api. */
export function deviceIdentityHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const h: Record<string, string> = { 'X-Client-Id': getClientId() };
  const name = getDeviceName();
  if (name) h['X-Device-Name'] = encodeURIComponent(name);
  return h;
}

/**
 * What this browser reports about itself when it rings up an offline sale; stored with the
 * queued sale and replayed at sync, since by then a different person may be logged in.
 */
export function deviceSnapshot(): { client_id: string; device_name?: string; user_agent?: string } {
  if (typeof window === 'undefined') return { client_id: '' };
  const name = getDeviceName();
  return {
    client_id: getClientId(),
    ...(name ? { device_name: name } : {}),
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  };
}

/** A short guess at this browser's kind, used as the name field's placeholder. */
export function guessDeviceKind(): 'phone' | 'tablet' | 'computer' {
  if (typeof navigator === 'undefined') return 'computer';
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPadOS reports as a Mac
  if (/iPad|Tablet/.test(ua) || touchMac || (/Android/.test(ua) && !/Mobile/.test(ua))) return 'tablet';
  if (/Mobi|iPhone|iPod/.test(ua)) return 'phone';
  return 'computer';
}
