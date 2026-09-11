'use client';

import { useEffect } from 'react';

const RELOAD_FLAG_KEY = 'cv-stale-chunk-reload-at';
// Guards against a reload loop if the server itself is actually down/broken — a real deploy
// gap is a one-time miss, not a repeating condition, so a single reload per short window is
// enough to self-heal without risking a refresh storm against a genuinely failing backend.
const RELOAD_COOLDOWN_MS = 30_000;

function isStaleChunkError(reason: unknown): boolean {
  if (!reason) return false;
  const name = (reason as { name?: string })?.name ?? '';
  const message = String((reason as { message?: unknown })?.message ?? reason);
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk [\w.-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG_KEY) || 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
  } catch {
    /* sessionStorage unavailable (private mode) — reload anyway, this path is rare enough
     * that a missed cooldown guard is not worth failing the recovery over */
  }
  window.location.reload();
}

/**
 * StaleChunkRecovery — self-heals the "This page couldn't load" dead-end a long-open POS
 * terminal tab hits after a backend deploy replaces the JS bundle it's running.
 *
 * Root cause (audited 2026-09-11): pos-ui's service worker (public/sw.js) caches
 * `/_next/static/*` chunks cache-first with no per-deploy invalidation, and the update banner
 * (shared-ui-lib's PwaUpdater, wired via OfflineBar in org-shell) only ever prompts — it never
 * forces a reload. A cashier who leaves a terminal open through a shift across a deploy keeps
 * running the OLD bundle; the first time that stale runtime needs a chunk it hadn't already
 * fetched (a route not yet visited this session), the request hits the NOW-current deployment,
 * which no longer has that old content-hashed file on disk — a hard, uncaught ChunkLoadError.
 * Left unhandled this crashes the render tree (observed in prod as React error #185, "Maximum
 * update depth exceeded", immediately followed by the browser's own resource-load failure
 * screen) with no way back short of the user manually reloading. One hard reload re-fetches the
 * current build's HTML + chunk manifest and fully clears the stale module graph.
 */
export function StaleChunkRecovery() {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isStaleChunkError(event.reason)) reloadOnce();
    };
    const onError = (event: ErrorEvent) => {
      if (isStaleChunkError(event.error)) reloadOnce();
    };
    window.addEventListener('unhandledrejection', onRejection);
    // Capture phase: a failed <script>/<link> resource load fires a non-bubbling 'error' event
    // on the element itself, not window, in the bubble phase.
    window.addEventListener('error', onError, true);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError, true);
    };
  }, []);
  return null;
}
