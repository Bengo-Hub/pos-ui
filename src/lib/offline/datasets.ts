import { apiClient } from '@/lib/api/client';
import { kvKey } from '@/lib/db/kv-cache';
import { revalidateDataset, type CacheFirstOpts } from '@/lib/offline/cache-first';
import type { QueryClient } from '@tanstack/react-query';

/**
 * Registry of the reference datasets the POS caches IndexedDB-first.
 *
 * ONE definition per dataset, shared by (a) the cache-first read hooks and (b) the 5-min
 * background refresher — so what the UI reads and what the background job warms can never
 * drift apart. Fetchers call the same pos-api endpoints the original hooks used, with
 * `suppressErrorToast` so a failed background refresh never fires the global 5xx toast.
 */

export interface OfflineDataset {
  /** kvCache dataset name (also the sync-log entity). */
  name: string;
  scope: 'tenant' | 'outlet';
  /** React Query key the dataset backs (background refreshes push into it). */
  queryKey: (tenantID: string, outletID?: string) => readonly unknown[];
  fetch: (tenantID: string, outletID?: string) => Promise<unknown>;
  logDetail?: (data: unknown) => string;
  /** Some datasets are gated server-side by outlet use case (e.g. loyalty is retail/services
   *  only — pos-api 403s hospitality/QSR/pharmacy outlets). Mirror that gate here so the
   *  background job never wastes a request (and never logs a permanent false-alarm error)
   *  fetching a dataset this outlet can't use. Omit for datasets available to every use case. */
  appliesTo?: (useCase: string | undefined) => boolean;
}

const LOYALTY_USE_CASES = new Set(['retail', 'services']);
// Floor plans (sections + tables) are table-service concepts — pos-api's routes 403 every
// other use case, so retail/pharmacy/services outlets must never even request them.
const TABLE_SERVICE_USE_CASES = new Set(['hospitality', 'quick_service', 'hotel']);

const pos = (tenantID: string) => `/api/v1/${tenantID}/pos`;
const quiet = { suppressErrorToast: true };

const listLen = (d: unknown): string => {
  const arr = (d as { data?: unknown[] })?.data;
  return Array.isArray(arr) ? `${arr.length} items` : '';
};

export const OFFLINE_DATASETS: OfflineDataset[] = [
  {
    name: 'pos-settings',
    scope: 'tenant',
    queryKey: (t) => ['pos-settings', t] as const,
    fetch: (t) => apiClient.get(`${pos(t)}/settings`, undefined, quiet),
  },
  {
    name: 'pos-tenders',
    scope: 'tenant',
    queryKey: (t) => ['pos-tenders', t] as const,
    fetch: (t) => apiClient.get(`${pos(t)}/tenders`, undefined, quiet),
    logDetail: listLen,
  },
  {
    name: 'pos-categories',
    scope: 'outlet',
    queryKey: (t, o) => ['pos-categories', t, o ?? ''] as const,
    fetch: (t) => apiClient.get(`${pos(t)}/catalog/categories`, undefined, quiet),
    logDetail: listLen,
  },
  {
    name: 'loyalty-programs',
    scope: 'tenant',
    // Raw paginated response is what's cached/pushed; the hook normalizes via `select`.
    queryKey: (t) => ['loyalty-programs', t] as const,
    fetch: (t) => apiClient.get(`${pos(t)}/loyalty/programs`, undefined, quiet),
    // Mirrors pos-api's `ly.Use(RequireUseCase("retail","services"))` route gate — a
    // hospitality/QSR/pharmacy outlet 403s this endpoint by design, not a real failure.
    appliesTo: (useCase) => !!useCase && LOYALTY_USE_CASES.has(useCase),
  },
  {
    name: 'recent-orders',
    scope: 'outlet',
    queryKey: (t, o) => ['pos-recent-orders', t, o ?? ''] as const,
    fetch: (t) =>
      apiClient.get(
        `${pos(t)}/orders`,
        { limit: 20, page: 1, sort: 'created_at', order: 'desc' },
        quiet,
      ),
    logDetail: listLen,
  },
  {
    name: 'pos-sections',
    scope: 'outlet',
    queryKey: (t, o) => ['pos-sections', t, o ?? ''] as const,
    fetch: (t) => apiClient.get(`${pos(t)}/sections`, undefined, quiet),
    logDetail: listLen,
    // Table-service only — retail/pharmacy/services outlets 403 this by design.
    appliesTo: (useCase) => !!useCase && TABLE_SERVICE_USE_CASES.has(useCase),
  },
  {
    name: 'pos-tables',
    scope: 'outlet',
    queryKey: (t, o) => ['pos-tables', t, o ?? ''] as const,
    fetch: (t) => apiClient.get(`${pos(t)}/tables`, undefined, quiet),
    logDetail: listLen,
    // Table-service only — retail/pharmacy/services outlets 403 this by design.
    appliesTo: (useCase) => !!useCase && TABLE_SERVICE_USE_CASES.has(useCase),
  },
];

/** Lookup a registered dataset by name (throws on typo — fail fast in dev). */
export function getDataset(name: string): OfflineDataset {
  const ds = OFFLINE_DATASETS.find((d) => d.name === name);
  if (!ds) throw new Error(`Unknown offline dataset: ${name}`);
  return ds;
}

/** Build the cache-first options for one dataset instance (tenant/outlet resolved). */
export function datasetCacheOpts(
  ds: OfflineDataset,
  tenantID: string,
  outletID: string | undefined,
  qc?: QueryClient,
): CacheFirstOpts<unknown> {
  const scopedOutlet = ds.scope === 'outlet' ? outletID : undefined;
  return {
    cacheKey: kvKey(ds.name, tenantID, scopedOutlet),
    tenantId: tenantID,
    fetcher: () => ds.fetch(tenantID, scopedOutlet),
    queryKey: ds.queryKey(tenantID, scopedOutlet),
    queryClient: qc,
    logEntity: ds.name,
    logDetail: ds.logDetail,
  };
}

/** Refresh every registered dataset once (the 5-min background job body). Datasets whose
 *  `appliesTo` rejects this outlet's use case are skipped entirely — never fetched, never
 *  logged as an error. */
export async function refreshAllDatasets(
  tenantID: string,
  outletID: string | undefined,
  qc?: QueryClient,
  opts: { force?: boolean; useCase?: string } = {},
): Promise<void> {
  for (const ds of OFFLINE_DATASETS) {
    if (ds.appliesTo && !ds.appliesTo(opts.useCase)) continue;
    await revalidateDataset(datasetCacheOpts(ds, tenantID, outletID, qc), { force: opts.force });
  }
}
