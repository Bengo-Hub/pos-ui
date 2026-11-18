'use client';

import { useCallback, useEffect, useRef } from 'react';

const TIMEOUT_KEY = 'pos_screensaver_timeout_ms';
/** Default idle timeout: 5 minutes (per POS PIN-login uplift spec). */
const DEFAULT_MS = 5 * 60_000;
/** Largest delay setTimeout accepts. Anything longer fires at once, so it means "never". */
export const MAX_TIMER_MS = 2_147_483_647;
/** Stored device value for "never". */
const NEVER = 'never';

/** True when a timeout should actually arm a timer. 0, negative, huge or non-finite = disabled. */
export function isIdleTimeoutEnabled(ms: number | null | undefined): ms is number {
  return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 && ms < MAX_TIMER_MS;
}

/**
 * Device override set from the PIN page gear menu. Returns null when unset or invalid,
 * 0 for "never" (including the legacy 9_999_999_999 value), else milliseconds.
 */
export function getDeviceTimeoutOverrideMs(): number | null {
  if (typeof window === 'undefined') return null;
  let v: string | null = null;
  try { v = localStorage.getItem(TIMEOUT_KEY); } catch { return null; }
  if (!v) return null;
  if (v === NEVER) return 0;
  const n = parseInt(v, 10);
  if (isNaN(n)) return null;
  if (n >= MAX_TIMER_MS) return 0;
  return n < 5_000 ? null : n;
}

/** Device timeout in ms (0 = never), falling back to the 5-minute default. */
export function getScreensaverTimeoutMs(): number {
  return getDeviceTimeoutOverrideMs() ?? DEFAULT_MS;
}

/**
 * Resolve the PIN-page screensaver timeout (ms, 0 = never): device override, then the outlet
 * setting (`screensaver_timeout_seconds`), then the 5-minute default.
 */
export function resolveScreensaverTimeoutMs(configSeconds?: number | null): number {
  const device = getDeviceTimeoutOverrideMs();
  if (device !== null) return device;
  if (typeof configSeconds === 'number' && configSeconds >= 5) return Math.round(configSeconds * 1000);
  return DEFAULT_MS;
}

/** Saves the device override. 0 means never. */
export function setScreensaverTimeoutMs(ms: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TIMEOUT_KEY, ms <= 0 || ms >= MAX_TIMER_MS ? NEVER : String(Math.max(5_000, ms)));
  } catch { /* storage unavailable */ }
}

/** Settings fields that drive the signed-in idle timeout (GET /pos/settings). */
export interface IdleTimeoutSettings {
  screensaver_timeout_seconds?: number | null;
  /** Role code (lowercase) to seconds. 0 = never sign out. */
  idle_timeout_by_role?: Record<string, number> | null;
  idle_countdown_seconds?: number | null;
}

// Role name fragments to canonical role codes. Order matters: barista before bar.
const ROLE_FRAGMENTS: Array<[string, string]> = [
  ['barista', 'barista'],
  ['kitchen', 'kitchen'],
  ['chef', 'kitchen'],
  ['cook', 'kitchen'],
  ['bar', 'bar'],
  ['reception', 'receptionist'],
  ['front_desk', 'receptionist'],
  ['waiter', 'waiter'],
  ['cashier', 'cashier'],
  ['manager', 'manager'],
  ['admin', 'admin'],
];

/** Canonical role code for a role name (kds page uses the same substring matching). */
export function canonicalRole(role: string): string | null {
  const lower = role.toLowerCase();
  for (const [frag, code] of ROLE_FRAGMENTS) {
    if (lower.includes(frag)) return code;
  }
  return null;
}

/** Seconds configured for the first of the user's roles that has a value, else undefined. */
export function roleTimeoutSeconds(
  byRole: Record<string, number> | null | undefined,
  roles: string[] | null | undefined,
): number | undefined {
  if (!byRole) return undefined;
  for (const r of roles ?? []) {
    const exact = byRole[r.toLowerCase()];
    if (typeof exact === 'number') return exact;
    const code = canonicalRole(r);
    if (code && typeof byRole[code] === 'number') return byRole[code];
  }
  return undefined;
}

/**
 * Signed-in idle timeout in ms (0 = never): device override, then the user's role value from
 * idle_timeout_by_role, then screensaver_timeout_seconds, then 5 minutes. On KDS routes the
 * kitchen value applies when longer, so a kitchen screen is not signed out mid-service.
 */
export function resolveIdleTimeoutMs(
  settings: IdleTimeoutSettings | null | undefined,
  roles: string[] | null | undefined,
  isKdsRoute = false,
): number {
  const byRole = settings?.idle_timeout_by_role ?? undefined;
  let ms: number;
  const device = getDeviceTimeoutOverrideMs();
  if (device !== null) {
    ms = device;
  } else {
    const roleSec = roleTimeoutSeconds(byRole, roles);
    const cfg = settings?.screensaver_timeout_seconds;
    if (typeof roleSec === 'number') ms = roleSec <= 0 ? 0 : roleSec * 1000;
    else if (typeof cfg === 'number' && cfg >= 5) ms = cfg * 1000;
    else ms = DEFAULT_MS;
  }
  if (isKdsRoute && ms !== 0 && typeof byRole?.kitchen === 'number') {
    ms = byRole.kitchen <= 0 ? 0 : Math.max(ms, byRole.kitchen * 1000);
  }
  return ms >= MAX_TIMER_MS ? 0 : ms;
}

const IDLE_EVENTS = [
  'mousemove', 'mousedown', 'keydown',
  'touchstart', 'pointerdown', 'scroll',
] as const;

/**
 * Fires onIdle after timeoutMs of inactivity, onActive on every user event.
 * timeoutMs undefined uses the device value; 0 or anything at/over MAX_TIMER_MS disables it.
 */
export function useIdleTimer(
  onIdle: () => void,
  onActive: () => void,
  timeoutMs?: number,
): void {
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);
  const onActRef  = useRef(onActive);

  useEffect(() => { onIdleRef.current = onIdle; }, [onIdle]);
  useEffect(() => { onActRef.current  = onActive; }, [onActive]);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const ms = timeoutMs ?? getScreensaverTimeoutMs();
    if (!isIdleTimeoutEnabled(ms)) return;
    timerRef.current = setTimeout(() => onIdleRef.current(), Math.min(ms, MAX_TIMER_MS));
  }, [timeoutMs]);

  const handleActivity = useCallback(() => {
    onActRef.current();
    schedule();
  }, [schedule]);

  useEffect(() => {
    IDLE_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    schedule(); // start immediately
    return () => {
      IDLE_EVENTS.forEach(e => window.removeEventListener(e, handleActivity));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [handleActivity, schedule]);
}
