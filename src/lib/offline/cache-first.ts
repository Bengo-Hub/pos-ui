import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { getKV, setKV, appendSyncLog } from '@/lib/db/kv-cache';
import { isEffectivelyOnline, isNetworkShapedError } from '@/lib/connectivity';

/**
 * cacheFirst — the app-wide IndexedDB-first read pattern (generalized from the proven
 * loadFullCatalog flow in usePOS.ts):
 *
 *  1. kvCache HIT  → return the cached payload instantly (paint never waits on network),
 *     then revalidate in the background (single-flight per key; failures swallowed — the
 *     cache stays authoritative; success updates kvCache + the React Query cache).
 *  2. kvCache MISS + effectively online → blocking fetch with a short timeout (a true
 *     cold start is the only time the UI waits), write-through to kvCache.
 *  3. kvCache MISS + fetch failed/offline → rethrow; the hook surfaces the error only
 *     when there is genuinely nothing to show.
 *
 * Use for reference-ish datasets (settings, tenders, categories, branding, outlet info,
 * recent orders). Mutation queues keep their own dedicated tables/flows.
 */

/** Blocking cold-start fetch budget — shorter than the axios 15s default so a weak
 *  network degrades to "empty state + background retry" instead of a long hang. */
export const COLD_START_TIMEOUT_MS = 8_000;

const inflight = new Set<string>();

/**
 * Per-dataset cooldown — a hard backstop independent of WHY revalidateDataset was called
 * (opportunistic cache-first hit on a component mount, the 5-min background job, a
 * reconnect/visibility trigger). The effective-online signal can legitimately flap on a
 * genuinely weak connection (unlike static navigator.onLine), and several call sites react
 * to that signal; without this, a flapping connection turns into a refetch storm. The
 * scheduled background job runs every 5 min, well above this gap, so it is never blocked —
 * this only suppresses ACCIDENTAL re-fires within the same short window.
 */
const REVALIDATE_COOLDOWN_MS = 30_000;
const lastRevalidateAt = new Map<string, number>();

export interface CacheFirstOpts<T> {
  /** kvCache key — build with kvKey(dataset, tenantId[, outletId]). */
  cacheKey: string;
  tenantId: string;
  /** Fetches the fresh dataset. Pass suppressErrorToast/timeout through to apiClient. */
  fetcher: (ctx: { background: boolean }) => Promise<T>;
  /** React Query key to push background-revalidated data into (keeps UI live). */
  queryKey?: QueryKey;
  queryClient?: QueryClient;
  /** Entity name for the sync-monitor log (defaults to the dataset part of cacheKey). */
  logEntity?: string;
  /** Summarize the payload for the sync log, e.g. items count. */
  logDetail?: (data: T) => string;
}

/** Fire-and-forget background refresh of one dataset (also used by the 5-min job).
 *  Pass `force: true` to bypass the cooldown (the manual "Refresh caches now" action). */
export async function revalidateDataset<T>(
  opts: CacheFirstOpts<T>,
  { force = false }: { force?: boolean } = {},
): Promise<T | null> {
  const { cacheKey, tenantId, fetcher, queryKey, queryClient, logDetail } = opts;
  const entity = opts.logEntity ?? cacheKey.split(':')[0];
  if (inflight.has(cacheKey)) return null;
  const last = lastRevalidateAt.get(cacheKey) ?? 0;
  if (!force && Date.now() - last < REVALIDATE_COOLDOWN_MS) return null;
  inflight.add(cacheKey);
  lastRevalidateAt.set(cacheKey, Date.now());
  try {
    const fresh = await fetcher({ background: true });
    await setKV(cacheKey, tenantId, fresh);
    if (queryClient && queryKey) queryClient.setQueryData(queryKey, fresh);
    void appendSyncLog({
      direction: 'pull', entity, status: 'ok', tenant_id: tenantId,
      detail: logDetail?.(fresh),
    });
    return fresh;
  } catch (err) {
    // Cache stays authoritative — never surface a failed refresh to the UI.
    void appendSyncLog({
      direction: 'pull', entity, status: 'error', tenant_id: tenantId,
      error: err instanceof Error ? err.message : 'refresh failed',
    });
    return null;
  } finally {
    inflight.delete(cacheKey);
  }
}

/** The queryFn body for cache-first hooks. */
export async function cacheFirst<T>(opts: CacheFirstOpts<T>): Promise<T> {
  const { cacheKey, tenantId, fetcher } = opts;

  const cached = await getKV<T>(cacheKey);
  if (cached !== undefined) {
    // Serve instantly; refresh behind the paint (only when the API looks reachable).
    if (isEffectivelyOnline()) void revalidateDataset(opts);
    return cached;
  }

  // True cold start — nothing cached yet. Try the network (bounded), even when the
  // effective-online signal is pessimistic: a cold cache has nothing to fall back on.
  try {
    const fresh = await fetcher({ background: false });
    await setKV(cacheKey, tenantId, fresh);
    return fresh;
  } catch (err) {
    if (isNetworkShapedError(err)) {
      const raced = await getKV<T>(cacheKey); // a concurrent revalidate may have landed
      if (raced !== undefined) return raced;
    }
    throw err;
  }
}
