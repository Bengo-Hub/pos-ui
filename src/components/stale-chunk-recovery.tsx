'use client';

import { useEffect } from 'react';

export const RELOAD_FLAG_KEY = 'cv-stale-chunk-reload-at';
// Guards against a reload loop if the server itself is actually down/broken — a real deploy
// gap is a one-time miss, not a repeating condition, so a single reload per short window is
// enough to self-heal without risking a refresh storm against a genuinely failing backend.
const RELOAD_COOLDOWN_MS = 30_000;

/**
 * Recognizes a failed-chunk-fetch error both by its RAW shape (thrown directly from the
 * dynamic `import()`/script load — `ChunkLoadError`, the various browser "failed to fetch
 * a module" phrasings) and by its DOWNSTREAM shape: with no React error boundary anywhere in
 * the tree (see error.tsx / global-error.tsx), React 19's own render-retry machinery can
 * swallow the original ChunkLoadError while repeatedly retrying the Suspense boundary that
 * keeps re-throwing it, and what actually reaches `window.onerror` a few retries later is
 * React's own "Maximum update depth exceeded" (minified error #185) — a different error
 * object with no trace of "chunk" or "import" in its message. Confirmed in inventory-ui (same
 * component, same bug) 2026-09-19: this is what actually reaches this listener for the
 * stale-bundle-after-a-deploy scenario, not the raw fetch failure, so it's treated as an
 * equally reliable signal.
 */
export function isStaleChunkError(reason: unknown): boolean {
  if (!reason) return false;
  const name = (reason as { name?: string })?.name ?? '';
  const message = String((reason as { message?: unknown })?.message ?? reason);
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk [\w.-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /Minified React error #185/.test(message)
  );
}

export function reloadOnce() {
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
 *
 * Follow-up (audited 2026-09-19, live-reported on inventory-ui's identical component): this
 * listener alone was NOT firing on the actual crash there — `isStaleChunkError` only matched
 * the raw fetch failure, but with no error boundary anywhere in either app the error that
 * actually reached `window.onerror` was always the downstream #185, never the original
 * ChunkLoadError (see that function's own comment). Fixed here too by matching #185, and by
 * adding `[orgSlug]/error.tsx` + `global-error.tsx` as a second line of defense: those catch
 * the render-phase throw directly (this listener alone cannot — a same-tick synchronous render
 * error doesn't always reach `window.onerror` before React has already torn down the tree) and
 * call this same `reloadOnce()` from `componentDidCatch`/render.
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
