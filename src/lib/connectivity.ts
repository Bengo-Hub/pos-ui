'use client';

/**
 * Effective-connectivity signal — the single source of truth for "are we offline?".
 *
 * `navigator.onLine` only reports whether the OS has a network interface up; a POS on
 * weak/captive wifi reads as "online" while every request times out. That made all our
 * offline fallbacks (IndexedDB reads, queued writes, offline PIN) dead code exactly when
 * they were needed. This store derives EFFECTIVE online-ness from real request outcomes:
 *
 *  - `navigator.onLine === false`  → effectively offline immediately.
 *  - N consecutive network-shaped request failures (timeout / DNS / connection reset /
 *    502-504 gateway errors) → effectively offline even though the OS says online.
 *  - Any successful transport (ANY HTTP response, including 4xx/500 — the server was
 *    reached) → effectively online again.
 *  - While offline-by-failures, a lightweight `/healthz` probe (4s timeout) runs every
 *    20s so we recover without waiting for user-triggered traffic.
 *
 * The axios apiClient reports every request outcome here; UI/hooks consume
 * `useEffectiveOnline()`; non-React code calls `isEffectivelyOnline()`.
 */

import { create } from 'zustand';

/** Consecutive network-shaped failures before we flip to effectively-offline. */
const FAILURE_THRESHOLD = 2;
const PROBE_INTERVAL_MS = 20_000;
const PROBE_TIMEOUT_MS = 4_000;

interface ConnectivityState {
  /** Best-guess reachability of the POS API (the value everything should gate on). */
  effectiveOnline: boolean;
  /** `navigator.onLine` mirror (raw OS signal). */
  browserOnline: boolean;
  consecutiveFailures: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
}

export const useConnectivityStore = create<ConnectivityState>(() => ({
  effectiveOnline: true,
  browserOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  consecutiveFailures: 0,
  lastSuccessAt: null,
  lastFailureAt: null,
}));

/** True when the request could not reach the server (vs. a business/server-side error).
 *  Covers axios timeouts (ECONNABORTED), fetch/DNS failures (TypeError / ERR_NETWORK /
 *  no response), and gateway errors (502/503/504) that mean "the API is unreachable". */
export function isNetworkShapedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as {
    code?: string;
    status?: number;
    response?: { status?: number };
    request?: unknown;
    name?: string;
  };
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
  // Raw fetch() network failure ("Failed to fetch" / "NetworkError…") throws a TypeError.
  if (e.name === 'TypeError') return true;
  if (e.code === 'ECONNABORTED' || e.code === 'ERR_NETWORK' || e.code === 'ETIMEDOUT') return true;
  const status = e.response?.status ?? e.status;
  if (status === 502 || status === 503 || status === 504) return true;
  // Axios shape: request made, no response at all (network layer failure).
  if (e.request !== undefined && e.response === undefined && e.code !== undefined) return true;
  return false;
}

/** Report a successful transport (any HTTP response — the server was reached). */
export function reportNetworkSuccess(): void {
  const s = useConnectivityStore.getState();
  if (s.effectiveOnline && s.consecutiveFailures === 0) {
    useConnectivityStore.setState({ lastSuccessAt: Date.now() });
    return;
  }
  useConnectivityStore.setState({
    effectiveOnline: s.browserOnline,
    consecutiveFailures: 0,
    lastSuccessAt: Date.now(),
  });
}

/** Report a network-shaped failure (timeout / unreachable / gateway error). */
export function reportNetworkFailure(): void {
  const s = useConnectivityStore.getState();
  const failures = s.consecutiveFailures + 1;
  useConnectivityStore.setState({
    consecutiveFailures: failures,
    lastFailureAt: Date.now(),
    effectiveOnline: failures >= FAILURE_THRESHOLD ? false : s.effectiveOnline,
  });
  if (failures >= FAILURE_THRESHOLD) ensureProbe();
}

/** Non-React accessor for the effective connectivity (sync worker, imperative flows). */
export function isEffectivelyOnline(): boolean {
  return useConnectivityStore.getState().effectiveOnline;
}

/** React hook — effective connectivity for gating offline fallbacks. */
export function useEffectiveOnline(): boolean {
  return useConnectivityStore((s) => s.effectiveOnline);
}

// ── Recovery probe ────────────────────────────────────────────────────────────
// While offline-by-failures (browser still claims online), ping /healthz until it
// answers, then flip back. The browser 'online' event also triggers a probe.

let probeTimer: ReturnType<typeof setInterval> | null = null;

async function probeOnce(): Promise<void> {
  const base = process.env.NEXT_PUBLIC_API_URL || 'https://posapi.codevertexitsolutions.com';
  try {
    const res = await fetch(`${base}/healthz`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (res.ok || res.status < 500) reportNetworkSuccess();
    else reportNetworkFailure();
  } catch {
    // Unreachable — stay offline; the interval retries.
    useConnectivityStore.setState({ lastFailureAt: Date.now() });
  }
}

function ensureProbe(): void {
  if (typeof window === 'undefined' || probeTimer) return;
  probeTimer = setInterval(() => {
    const s = useConnectivityStore.getState();
    if (s.effectiveOnline || !s.browserOnline) {
      // Recovered (or hard-offline where the 'online' event will wake us) — stop probing.
      if (probeTimer) clearInterval(probeTimer);
      probeTimer = null;
      return;
    }
    void probeOnce();
  }, PROBE_INTERVAL_MS);
}

// ── Browser online/offline events (module-scope, client only) ────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useConnectivityStore.setState({ browserOnline: true });
    // Don't trust the OS blindly — verify the API is actually reachable.
    void probeOnce();
  });
  window.addEventListener('offline', () => {
    useConnectivityStore.setState({ browserOnline: false, effectiveOnline: false });
  });
}
