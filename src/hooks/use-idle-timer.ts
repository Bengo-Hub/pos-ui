'use client';

import { useCallback, useEffect, useRef } from 'react';

const TIMEOUT_KEY = 'pos_screensaver_timeout_ms';
/** Default branded-screensaver idle timeout: 5 minutes (per POS PIN-login uplift spec). */
const DEFAULT_MS = 5 * 60_000;

export function getScreensaverTimeoutMs(): number {
  if (typeof window === 'undefined') return DEFAULT_MS;
  const v = localStorage.getItem(TIMEOUT_KEY);
  const n = v ? parseInt(v, 10) : NaN;
  return isNaN(n) || n < 5_000 ? DEFAULT_MS : n;
}

/**
 * Resolve the effective screensaver timeout (ms): a service_config / outlet-setting value wins
 * over the device-local setting, which wins over the 5-minute default. `configSeconds` comes from
 * the outlet settings payload (`screensaver_timeout_seconds`) when present, so a platform/tenant
 * admin can set it centrally without a new endpoint.
 */
export function resolveScreensaverTimeoutMs(configSeconds?: number | null): number {
  if (typeof configSeconds === 'number' && configSeconds >= 5) {
    return Math.round(configSeconds * 1000);
  }
  return getScreensaverTimeoutMs();
}

export function setScreensaverTimeoutMs(ms: number): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TIMEOUT_KEY, String(Math.max(5_000, ms)));
  }
}

const IDLE_EVENTS = [
  'mousemove', 'mousedown', 'keydown',
  'touchstart', 'pointerdown', 'scroll',
] as const;

/**
 * Fires onIdle after timeoutMs of inactivity, onActive on every user event.
 * timeoutMs defaults to the value stored in localStorage (or 30 s).
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
    const ms = timeoutMs ?? getScreensaverTimeoutMs();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onIdleRef.current(), ms);
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
