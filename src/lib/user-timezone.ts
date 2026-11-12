/**
 * Time zones for screens. SSO (auth-api) owns them and GET /api/v1/auth/me carries both:
 * `profile.timezone` for the signed-in person and `tenant.timezone` for the active organisation.
 * A screen shows times in the person's zone, then the organisation's, then Africa/Nairobi.
 *
 * Each app calls `applyUserTimeZone(me, me.tenant)` once /me loads. From then on the formatters
 * below use that zone unless a call passes its own. Pure TypeScript, safe on the server, where
 * the active zone stays Africa/Nairobi.
 *
 * Local copy of shared-ui-lib's format/timezone.ts. It moves to `@bengo-hub/shared-ui-lib`
 * v0.1.145 once that tag is released and pinned here; delete this file then.
 */

export const DEFAULT_TIME_ZONE = 'Africa/Nairobi';

/** The fields of the /me user this module reads. */
export interface TimeZoneUser {
  profile?: { timezone?: string | null } | null;
  timezone?: string | null;
}

/** The fields of the /me tenant this module reads. */
export interface TimeZoneTenant {
  timezone?: string | null;
}

export type DateInput = Date | string | number | null | undefined;

/**
 * Intl options plus a locale. Naming any date or time part (or dateStyle/timeStyle) replaces
 * the formatter's default parts; options such as hour12 alone merge with them.
 */
export interface DateFormatOptions extends Intl.DateTimeFormatOptions {
  /** Defaults to en-KE ("14 Nov 2026"). */
  locale?: string;
  /** Returned for empty input. Unparseable strings come back unchanged. Defaults to ''. */
  fallback?: string;
}

const validity = new Map<string, boolean>();

/** True when this runtime knows the IANA zone name. */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.trim() === '') return false;
  const cached = validity.get(zone);
  if (cached !== undefined) return cached;
  let ok = true;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
  } catch {
    ok = false;
  }
  validity.set(zone, ok);
  return ok;
}

/** The user's zone, then the tenant's, then Africa/Nairobi. Unknown names are skipped. */
export function resolveTimeZone(user?: TimeZoneUser | null, tenant?: TimeZoneTenant | null): string {
  const candidates = [user?.profile?.timezone, user?.timezone, tenant?.timezone];
  for (const zone of candidates) {
    const trimmed = typeof zone === 'string' ? zone.trim() : zone;
    if (isValidTimeZone(trimmed)) return trimmed;
  }
  return DEFAULT_TIME_ZONE;
}

// The active zone lives on globalThis so every bundle entry (the root entry and /format each
// carry a copy of this file) and every duplicate install share one value.
interface ZoneStore {
  zone: string;
  listeners: Set<() => void>;
}
const STORE_KEY = Symbol.for('@bengo-hub/shared-ui-lib/time-zone');

function store(): ZoneStore {
  const g = globalThis as unknown as Record<symbol, ZoneStore | undefined>;
  let s = g[STORE_KEY];
  if (!s) {
    s = { zone: DEFAULT_TIME_ZONE, listeners: new Set() };
    g[STORE_KEY] = s;
  }
  return s;
}

/** The zone screens use right now. */
export function getActiveTimeZone(): string {
  return store().zone;
}

/** Sets the zone screens use. An unknown name resets it to Africa/Nairobi. */
export function setActiveTimeZone(zone: string | null | undefined): string {
  const s = store();
  const next = isValidTimeZone(zone) ? zone : DEFAULT_TIME_ZONE;
  if (next !== s.zone) {
    s.zone = next;
    s.listeners.forEach((fn) => fn());
  }
  return next;
}

/** Resolves the zone from a /me answer and makes it the active one. Returns the zone. */
export function applyUserTimeZone(user?: TimeZoneUser | null, tenant?: TimeZoneTenant | null): string {
  return setActiveTimeZone(resolveTimeZone(user, tenant));
}

/** Calls `listener` whenever the active zone changes. Returns the unsubscribe function. */
export function subscribeTimeZone(listener: () => void): () => void {
  const s = store();
  s.listeners.add(listener);
  return () => {
    s.listeners.delete(listener);
  };
}

function toDate(value: DateInput): Date | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isCalendarDay(value: DateInput): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    formatters.set(key, f);
  }
  return f;
}

const DATE_PARTS: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
const TIME_PARTS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
const PART_KEYS = [
  'dateStyle', 'timeStyle', 'weekday', 'era', 'year', 'month', 'day', 'dayPeriod',
  'hour', 'minute', 'second', 'fractionalSecondDigits', 'timeZoneName',
];

function format(
  value: DateInput,
  timeZone: string | null | undefined,
  defaults: Intl.DateTimeFormatOptions,
  options: DateFormatOptions = {},
): string {
  const { locale = 'en-KE', fallback = '', ...intl } = options;
  const date = toDate(value);
  if (!date) return typeof value === 'string' && value !== '' ? value : fallback;
  // A bare "YYYY-MM-DD" is a calendar day, not an instant. It parses as UTC midnight, so we
  // format it in UTC to keep the same day in every zone.
  const zone = isCalendarDay(value) ? 'UTC' : isValidTimeZone(timeZone) ? timeZone : getActiveTimeZone();
  // Like toLocaleString: the default parts apply only when the caller names none of its own.
  const named = intl as Record<string, unknown>;
  const base = PART_KEYS.some((k) => named[k] !== undefined) ? {} : defaults;
  return formatter(locale, { ...base, ...intl, timeZone: zone }).format(date);
}

/** "14 Nov 2026" in the given zone, or the active zone when none is given. */
export function formatDate(value: DateInput, timeZone?: string | null, options?: DateFormatOptions): string {
  return format(value, timeZone, DATE_PARTS, options);
}

/** "14 Nov 2026, 01:30" (24 hour) in the given zone, or the active zone when none is given. */
export function formatDateTime(value: DateInput, timeZone?: string | null, options?: DateFormatOptions): string {
  return format(value, timeZone, { ...DATE_PARTS, ...TIME_PARTS }, options);
}

/** "01:30" (24 hour) in the given zone, or the active zone when none is given. */
export function formatTime(value: DateInput, timeZone?: string | null, options?: DateFormatOptions): string {
  return format(value, timeZone, TIME_PARTS, options);
}
