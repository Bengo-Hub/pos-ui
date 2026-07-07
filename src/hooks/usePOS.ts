'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRef } from 'react';
import {
  cacheCatalogItems,
  getCachedCatalog,
  replaceCachedCatalog,
  saveDraftOrder,
  saveDraftDrawerSession,
  saveDraftDrawerClose,
  type OfflineCatalogItem,
  type OfflineOrderLine,
} from '@/lib/db/pos-db';
import { useEffectiveOnline } from '@/lib/connectivity';
import { v4 as uuidv4 } from 'uuid';

// Get tenant ID from auth store
function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

function useTenantSlug() {
  return useAuthStore((s) => s.user?.tenant_slug ?? s.user?.tenant_id ?? '');
}

function useOutletID() {
  return useAuthStore((s) => (s.user as (typeof s.user & { outlet_id?: string }) | null)?.outlet_id ?? '');
}

/**
 * The outlet whose context every API call actually carries (apiClient X-Outlet-ID):
 * an HQ drill-down override first, else the session's active outlet, else the login
 * outlet claim. Cache keys for OUTLET-SCOPED data (the catalog) must use this so a
 * different outlet never reads another outlet's cached rows.
 */
export function useEffectiveOutletID() {
  return useAuthStore(
    (s) => s.selectedOutletId ?? s.outlet?.id ?? (s.user as (typeof s.user & { outlet_id?: string }) | null)?.outlet_id ?? '',
  );
}

/** Idempotency-Key header so the backend dedups a replayed/lost-response request. */
function idemHeaders(key: string) {
  return { headers: { 'Idempotency-Key': key } };
}

function basePath(tenantID: string) {
  return `/api/v1/${tenantID}/pos`;
}

export interface PricingTier {
  code: string;
  name: string;
  is_default: boolean;
  sort_order: number;
}

/** The tenant's active pricing tiers (Retail, Wholesale, custom e.g. Loyal Clients) from inventory,
 *  proxied by pos-api — drives the POS price-profile selector. */
export function usePricingTiers() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-pricing-tiers', tenantID],
    queryFn: () => apiClient.get<{ data: PricingTier[] }>(`${basePath(tenantID)}/catalog/pricing/tiers`),
    enabled: !!tenantID,
    staleTime: 300_000,
  });
}

/** A treasury tax code (the platform source of truth for tax rates), proxied by pos-api. The POS
 *  applies each item's enriched rate at checkout; this list is shown read-only in Settings → Tax. */
export interface TaxCode {
  id: string;
  code: string;
  name: string;
  rate: number;
  tax_type?: string;
  kra_code?: string;
  is_default?: boolean;
}

/** The tenant's tax codes/rates from treasury (the source of truth), proxied by pos-api.
 *  Degrades to an empty list when treasury is unreachable or none are configured. */
export function useTaxCodes() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-tax-codes', tenantID],
    queryFn: () =>
      apiClient.get<{ tax_codes?: TaxCode[]; total?: number }>(`${basePath(tenantID)}/tax-codes`),
    enabled: !!tenantID,
    staleTime: 5 * 60_000,
    select: (res) => res.tax_codes ?? [],
  });
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export interface ExpenseCategory {
  id: string;
  code?: string;
  name: string;
  is_active?: boolean;
}

export interface ExpenseAccount {
  id: string;
  code: string;
  name: string;
  type?: string;
  category?: string;
}

/** Expense categories (from treasury, proxied by pos-api) for the Add-Expense form dropdown.
 *  Degrades to an empty list when none are configured. */
export function useExpenseCategories() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-expense-categories', tenantID],
    queryFn: () =>
      apiClient.get<{ categories?: ExpenseCategory[]; total?: number }>(
        `${basePath(tenantID)}/expenses/categories`,
      ),
    enabled: !!tenantID,
    staleTime: 5 * 60_000,
    select: (res) => res.categories ?? [],
  });
}

/** Chart-of-accounts (from treasury, proxied by pos-api) for the Add-Expense "Payment Account"
 *  dropdown. Degrades to an empty list when none are configured. */
export function useExpenseAccounts() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-expense-accounts', tenantID],
    queryFn: () =>
      apiClient.get<{ accounts?: ExpenseAccount[]; total?: number }>(
        `${basePath(tenantID)}/expenses/accounts`,
      ),
    enabled: !!tenantID,
    staleTime: 5 * 60_000,
    select: (res) => res.accounts ?? [],
  });
}

export interface AddExpenseInput {
  description: string; // "Expense note"
  amount: number; // "Total amount"
  category_id?: string;
  reference_no?: string;
  expense_date?: string; // YYYY-MM-DD
  account_id?: string; // Payment Account
  vendor_id?: string;
  cost_center_id?: string;
  tax_amount?: number;
  tax_rate?: number;
  currency?: string;
  payment_method?: string;
  paid_on?: string;
  payment_note?: string;
  payment_amount?: number;
  expense_for?: string; // free-text label when no vendor selected
}

// useAddExpense records an expense entered at the register straight to treasury
// (via pos-api POST /pos/expenses → treasury S2S). No money moves through the till.
export function useAddExpense() {
  const tenantID = useTenantID();
  return useMutation({
    mutationFn: (data: AddExpenseInput) =>
      apiClient.post(`${basePath(tenantID)}/expenses`, data),
  });
}

// ─── M-Pesa C2B (paybill / till reconciliation) ───────────────────────────────

export interface C2BPayment {
  id: string;
  trans_id: string;
  amount: number | string; // treasury serializes the decimal as a quoted string
  business_shortcode: string;
  bill_ref_number?: string;
  msisdn?: string;
  payer_name?: string;
  status: string;
}

// useListC2BPayments queries unreconciled M-Pesa C2B (paybill/Buy-Goods till) inbox payments from
// treasury (via pos-api), optionally narrowed to a target amount, so the cashier can match one to
// the open sale. Polls while enabled so a payment that lands mid-checkout appears automatically.
export function useListC2BPayments(amount?: number, enabled = true) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-c2b', tenantID, amount],
    queryFn: () => {
      const qs = new URLSearchParams({ status: 'unreconciled' });
      if (amount && amount > 0) qs.set('amount', String(amount));
      return apiClient.get<{ candidates: C2BPayment[]; count: number }>(
        `${basePath(tenantID)}/c2b/payments?${qs.toString()}`
      );
    },
    enabled: enabled && !!tenantID,
    refetchInterval: enabled ? 4000 : false,
  });
}

// useClaimC2BPayment binds a C2B payment to a POS order AND settles the order (pos-api records a
// completed payment of `amount` referencing the M-Pesa TransID).
export function useClaimC2BPayment() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ transID, posOrderId, amount, tenderId }: { transID: string; posOrderId: string; amount: number; tenderId?: string }) =>
      apiClient.post(`${basePath(tenantID)}/c2b/payments/${transID}/claim`, {
        pos_order_id: posOrderId,
        amount,
        tender_id: tenderId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-c2b'] }),
  });
}

// ─── Catalog Items ──────────────────────────────────────────────────────────

export interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category: string;
  item_type?: string;
  duration_minutes?: number;
  tax_status?: string;
  status?: string;
  is_available?: boolean;
  is_featured?: boolean;
  /** Free-of-charge accompaniment (price forced 0 by pos-api; receipt shows Free). */
  is_complimentary?: boolean;
  /** Inventory Item.non_billable — never charged at the till even if a price exists. */
  non_billable?: boolean;
  display_order?: number;
  image_url?: string;
  barcode?: string;
  price?: number;
  // Tax — enriched by inventory-api from treasury-api (the source of truth). The POS terminal
  // applies THESE per-item values at checkout instead of a flat outlet rate.
  tax_code_id?: string;
  tax_inclusive?: boolean;
  tax_rate?: number;   // VAT % applied to this item (resolved from treasury)
  net_price?: number;  // selling price excluding tax
  tax_amount?: number; // tax portion of the selling price
  requires_age_verification?: boolean;
  track_serial_numbers?: boolean;
  requires_prescription?: boolean;
  is_controlled_substance?: boolean;
  minimum_age?: number;
  is_returnable?: boolean;
  outlet_id?: string;
  metadata?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  page: number;
}

/** Map rich catalog DTOs to the lean OfflineCatalogItem rows pos-db stores, stamped with the
 *  outlet they were fetched for (the pos-api catalog is outlet-scoped). */
function toOfflineCatalogRows(tenantID: string, outletID: string, items: CatalogItem[]): OfflineCatalogItem[] {
  const now = new Date().toISOString();
  return items.map((i) => ({
    id: i.id,
    tenant_id: tenantID,
    outlet_id: outletID || undefined,
    sku: i.sku,
    name: i.name,
    category: i.category ?? '',
    unit_price: i.price ?? i.net_price ?? 0,
    tax_status: i.tax_status ?? 'taxable',
    status: i.status ?? 'active',
    image_url: i.image_url,
    barcode: i.barcode,
    metadata: i.metadata,
    cached_at: now,
  }));
}

/** Write fetched catalog rows through to the IndexedDB offline cache (best-effort,
 *  non-blocking) so the terminal keeps working — and reopens instantly — offline. */
export function cacheCatalogPage(tenantID: string, outletID: string, items: CatalogItem[] | undefined): void {
  if (!tenantID || !items?.length) return;
  void cacheCatalogItems(toOfflineCatalogRows(tenantID, outletID, items)).catch(() => { /* offline cache is best-effort */ });
}

export function useMenuItems(filters?: {
  category?: string;
  search?: string;
  itemType?: string;
  page?: number;
  limit?: number;
}) {
  const tenantID = useTenantID();
  const outletID = useEffectiveOutletID();
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 50;
  return useQuery({
    // outletID keys the cache because the server list is outlet-scoped (use-case filtered).
    queryKey: ['pos-catalog-items', tenantID, outletID, filters?.category, filters?.search, filters?.itemType, page, limit],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<CatalogItem>>(`${basePath(tenantID)}/catalog/items`, {
        category: filters?.category,
        search: filters?.search,
        item_type: filters?.itemType,
        page,
        limit,
      });
      // Keep the offline catalog cache fresh as the cashier browses (prices/availability).
      cacheCatalogPage(tenantID, outletID, res?.data);
      return res;
    },
    enabled: !!tenantID,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

/** Map a lean offline-cache row back to the rich catalog DTO the terminal renders. */
export function offlineToCatalogItem(c: OfflineCatalogItem): CatalogItem {
  return {
    id: c.id,
    sku: c.sku,
    name: c.name,
    category: c.category,
    price: c.unit_price,
    tax_status: c.tax_status,
    status: c.status,
    image_url: c.image_url,
    barcode: c.barcode,
    metadata: c.metadata,
  };
}

/** Pull the ENTIRE catalog (loop every page) so client-side filter/search/pagination
 *  operate on the complete set — never a single page. Capped to avoid a runaway loop. */
async function fetchAllCatalogItems(tenantID: string, opts?: { timeout?: number }): Promise<CatalogItem[]> {
  const limit = 200;
  const all: CatalogItem[] = [];
  for (let page = 1; page <= 100; page++) {
    const res = await apiClient.get<PaginatedResponse<CatalogItem>>(
      `${basePath(tenantID)}/catalog/items`,
      { page, limit },
      { suppressErrorToast: true, timeout: opts?.timeout },
    );
    const batch = res?.data ?? [];
    all.push(...batch);
    const total = res?.total ?? all.length;
    if (batch.length < limit || all.length >= total) break;
  }
  return all;
}

export const FULL_CATALOG_QUERY_KEY = 'pos-catalog-full';

// Single-flight guard: at most ONE background catalog revalidation per tenant+outlet at a time
// (mount + version-poll + reconnect can all ask for one in the same tick).
const catalogRevalidateInflight = new Set<string>();

// Cooldown backstop: CatalogPrewarm's isOnline-triggered effect and useBackgroundSync's
// reconnect effect both call this uncooled on every connectivity change. The effective-online
// signal can legitimately FLAP on a genuinely weak connection (that's the whole point of it —
// unlike static navigator.onLine, which never flapped) — without this, a flapping connection
// turns into a full-catalog refetch storm. The 5-min background job always clears it (30s « 5min).
const CATALOG_REVALIDATE_COOLDOWN_MS = 30_000;
const lastCatalogRevalidateAt = new Map<string, number>();

/**
 * Fetch the COMPLETE catalog from the API in the background and propagate it everywhere:
 * IndexedDB (REPLACING this outlet's slice — removed/re-scoped items actually disappear)
 * AND the TanStack query cache (so any mounted terminal re-renders with the new items
 * immediately, no refresh / re-login). Failures are swallowed — the terminal keeps serving
 * its cache. Returns the fresh set, or null when skipped (in-flight/cooldown) / failed.
 * outletID scopes both caches: the server list is outlet-scoped (use-case filtered), so a
 * retail outlet must never serve/keep the hospitality outlet's menu.
 */
export async function revalidateFullCatalog(
  qc: QueryClient,
  tenantID: string,
  outletID: string,
  opts: { force?: boolean } = {},
): Promise<CatalogItem[] | null> {
  const flightKey = `${tenantID}:${outletID}`;
  if (!tenantID || catalogRevalidateInflight.has(flightKey)) return null;
  const last = lastCatalogRevalidateAt.get(flightKey) ?? 0;
  if (!opts.force && Date.now() - last < CATALOG_REVALIDATE_COOLDOWN_MS) return null;
  catalogRevalidateInflight.add(flightKey);
  lastCatalogRevalidateAt.set(flightKey, Date.now());
  try {
    const all = await fetchAllCatalogItems(tenantID);
    if (all.length) {
      // Replace (not union) this outlet's cached slice — best-effort, non-blocking.
      void replaceCachedCatalog(tenantID, outletID, toOfflineCatalogRows(tenantID, outletID, all))
        .catch(() => { /* offline cache is best-effort */ });
      qc.setQueryData([FULL_CATALOG_QUERY_KEY, tenantID, outletID], all);
    }
    void import('@/lib/db/kv-cache').then(({ appendSyncLog }) =>
      appendSyncLog({ direction: 'pull', entity: 'catalog', status: 'ok', tenant_id: tenantID, detail: `${all.length} items` }));
    return all;
  } catch (err) {
    void import('@/lib/db/kv-cache').then(({ appendSyncLog }) =>
      appendSyncLog({ direction: 'pull', entity: 'catalog', status: 'error', tenant_id: tenantID, error: err instanceof Error ? err.message : 'refresh failed' }));
    return null; // offline / transient — cache stays authoritative
  } finally {
    catalogRevalidateInflight.delete(flightKey);
  }
}

/**
 * Load the full catalog, local-cache-FIRST (stale-while-revalidate):
 *  - Cache has items → return it immediately (instant paint even on a slow connection)
 *    and, when online, kick a background revalidation that refreshes IndexedDB + the
 *    query cache when the network answers.
 *  - Cache empty + online (true cold start) → block on the network once, write through.
 *  - Offline → serve the IndexedDB cache, full stop.
 * IndexedDB is only *fully* relied on when there is no connection; with a connection the
 * background sync keeps the cache active on every load and version bump.
 */
export async function loadFullCatalog(
  tenantID: string,
  outletID: string,
  isOnline: boolean,
  qc?: QueryClient,
): Promise<CatalogItem[]> {
  if (!tenantID) return [];
  // Only THIS outlet's cached slice — never another outlet's menu (server list is outlet-scoped).
  const cached = await getCachedCatalog(tenantID, outletID).catch(() => [] as OfflineCatalogItem[]);
  if (!isOnline) {
    return cached.map(offlineToCatalogItem);
  }
  if (cached.length) {
    if (qc) void revalidateFullCatalog(qc, tenantID, outletID); // background — never blocks the paint
    return cached.map(offlineToCatalogItem);
  }
  // Cold start: nothing cached yet for this outlet, so the network is the only source.
  // Bounded per-page timeout: on weak wifi the terminal degrades to an empty grid that the
  // background revalidate/version-poll fills in, instead of hanging on the axios 15s default.
  const all = await fetchAllCatalogItems(tenantID, { timeout: 10_000 });
  void replaceCachedCatalog(tenantID, outletID, toOfflineCatalogRows(tenantID, outletID, all))
    .catch(() => { /* offline cache is best-effort */ });
  return all;
}

/**
 * The terminal's catalog source. Returns the COMPLETE catalog so the terminal can
 * resolve category/search/brand/pagination locally over the full set. It is
 * cache-first: IndexedDB answers instantly (even on a slow connection) while a
 * background revalidation refreshes both caches. Falls back to the local cache when
 * offline or on network error.
 */
export function useFullCatalog() {
  const tenantID = useTenantID();
  const outletID = useEffectiveOutletID();
  const isOnline = useEffectiveOnline();
  const qc = useQueryClient();
  return useQuery({
    // Keyed per tenant AND outlet: the server catalog is outlet-scoped (use-case filtered),
    // so switching outlets must never serve the previous outlet's cached menu.
    queryKey: [FULL_CATALOG_QUERY_KEY, tenantID, outletID],
    queryFn: () => loadFullCatalog(tenantID, outletID, isOnline, qc),
    enabled: !!tenantID,
    staleTime: 5 * 60_000,
    networkMode: 'always',
    placeholderData: (prev) => prev,
  });
}

/**
 * Polls the cheap `GET /pos/catalog/version` fingerprint (~45s, rate-limit-exempt server-side)
 * and background-refreshes the full catalog whenever it changes — this is how a newly added
 * inventory item appears on the terminal within a minute, with no refresh and no re-login.
 * The fingerprint bumps whenever pos-api's inventory.item.created/updated NATS consumer
 * touches the tenant's catalog projection. Offline → the poll pauses automatically.
 */
export function useCatalogVersionSync() {
  const tenantID = useTenantID();
  const outletID = useEffectiveOutletID();
  const isOnline = useEffectiveOnline();
  const qc = useQueryClient();
  const lastVersion = useRef<string | null>(null);
  useQuery({
    queryKey: ['pos-catalog-version', tenantID, outletID],
    queryFn: async () => {
      const res = await apiClient.get<{ version: string }>(`${basePath(tenantID)}/catalog/version`);
      const v = res?.version ?? '0-0';
      if (lastVersion.current !== null && v !== lastVersion.current) {
        void revalidateFullCatalog(qc, tenantID, outletID);
      }
      lastVersion.current = v;
      return v;
    },
    enabled: !!tenantID && isOnline,
    refetchInterval: 45_000,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useCreateMenuItem() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sku: string; name: string; category: string }) =>
      apiClient.post(`${basePath(tenantID)}/catalog/items`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-catalog-items'] }),
  });
}

export interface POSCategory {
  name: string;
  /** Emoji or icon-class name for inline display. */
  icon?: string;
  /** Resolved image URL; render as <img> when present. */
  image_url?: string;
}

// Raw categories may arrive in the new typed shape ({name, icon, image_url})
// or the legacy shape (bare string names). Normalize both to POSCategory[].
type RawCategory = string | { name?: string; icon?: string; image_url?: string };

function normalizeCategories(raw: RawCategory[] | undefined): POSCategory[] {
  if (!raw) return [];
  return raw
    .map((c): POSCategory | null => {
      if (typeof c === 'string') {
        return c ? { name: c } : null;
      }
      if (c && typeof c.name === 'string' && c.name) {
        return { name: c.name, icon: c.icon || undefined, image_url: c.image_url || undefined };
      }
      return null;
    })
    .filter((c): c is POSCategory => c !== null);
}

export function useCategories() {
  const tenantID = useTenantID();
  const outletID = useEffectiveOutletID();
  const qc = useQueryClient();
  return useQuery({
    // outletID keys the cache: categories derive from the outlet-scoped catalog, so a retail
    // outlet must not paint the hospitality outlet's category tabs (and vice versa).
    queryKey: ['pos-categories', tenantID, outletID || ''],
    // IndexedDB-first: category tabs paint from cache; background revalidate keeps them fresh.
    queryFn: async () => {
      const { cacheFirst } = await import('@/lib/offline/cache-first');
      const { getDataset, datasetCacheOpts } = await import('@/lib/offline/datasets');
      return cacheFirst(
        datasetCacheOpts(getDataset('pos-categories'), tenantID, outletID || undefined, qc),
      ) as Promise<{ data: RawCategory[] }>;
    },
    enabled: !!tenantID,
    staleTime: 10 * 60_000,
    networkMode: 'always',
    select: (res) => normalizeCategories(res.data),
  });
}

// ─── Sections ───────────────────────────────────────────────────────────────

interface Section {
  id: string;
  name: string;
  slug: string;
  section_type: string;
  floor_number: number;
  sort_order: number;
  is_active: boolean;
  edges?: { tables?: Table[] };
}

export function useSections() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-sections', tenantID],
    queryFn: () => apiClient.get<PaginatedResponse<Section>>(`${basePath(tenantID)}/sections`),
    enabled: !!tenantID,
    staleTime: 30_000,
  });
}

// ─── Tables ─────────────────────────────────────────────────────────────────

interface Table {
  id: string;
  name: string;
  capacity: number;
  status: string;
  table_type: string;
  section_id?: string;
  x_position?: number;
  y_position?: number;
  tags?: string[];
  occupied_since?: string;
  edges?: { section?: Section };
}

export function useTables(filters?: { status?: string; sectionId?: string }) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-tables', tenantID, filters],
    queryFn: () =>
      apiClient.get<PaginatedResponse<Table>>(`${basePath(tenantID)}/tables`, {
        status: filters?.status,
        section_id: filters?.sectionId,
      }),
    enabled: !!tenantID,
    staleTime: 10_000,
  });
}

export function useUpdateTableStatus() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, status }: { tableId: string; status: string }) =>
      apiClient.patch(`${basePath(tenantID)}/tables/${tableId}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-tables'] }),
  });
}

export function useAssignTable() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, orderId }: { tableId: string; orderId: string }) =>
      apiClient.post(`${basePath(tenantID)}/tables/${tableId}/assign`, { orderId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-tables'] }),
  });
}

export function useReleaseTable() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tableId: string) =>
      apiClient.post(`${basePath(tenantID)}/tables/${tableId}/release`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-tables'] }),
  });
}

export function useCreateSection() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { outletId: string; name: string; sectionType?: string; floorNumber?: number; sortOrder?: number }) =>
      apiClient.post<Section>(`${basePath(tenantID)}/sections`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-sections'] }),
  });
}

export function useUpdateSection() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, input }: { sectionId: string; input: { name?: string; isActive?: boolean } }) =>
      apiClient.put<Section>(`${basePath(tenantID)}/sections/${sectionId}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-sections'] }),
  });
}

export function useCreateTable() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { outletId: string; sectionId?: string; name: string; capacity: number; tableType?: string }) =>
      apiClient.post<Table>(`${basePath(tenantID)}/tables`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
      qc.invalidateQueries({ queryKey: ['pos-sections'] });
    },
  });
}

export function useUpdateTable() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, input }: { tableId: string; input: { name?: string; capacity?: number; tableType?: string; isActive?: boolean; xPosition?: number; yPosition?: number; sectionId?: string } }) =>
      apiClient.put<Table>(`${basePath(tenantID)}/tables/${tableId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
      qc.invalidateQueries({ queryKey: ['pos-sections'] });
    },
  });
}

export function useDeleteTable() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tableId: string) =>
      apiClient.delete(`${basePath(tenantID)}/tables/${tableId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
      qc.invalidateQueries({ queryKey: ['pos-sections'] });
    },
  });
}

export function useDeleteSection() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) =>
      apiClient.delete(`${basePath(tenantID)}/sections/${sectionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-sections'] });
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
    },
  });
}

export type { Section, Table };

// ─── Table Reservations ──────────────────────────────────────────────────────

export interface TableReservation {
  id: string;
  tenant_id: string;
  outlet_id: string;
  table_id?: string;
  guest_name: string;
  guest_phone?: string;
  guest_email?: string;
  party_size: number;
  scheduled_at: string;
  duration_minutes: number;
  status: 'pending' | 'confirmed' | 'checked_in' | 'cancelled' | 'no_show';
  notes?: string;
  special_requests?: string;
  source: string;
  cancellation_reason?: string;
  confirmed_at?: string;
  checked_in_at?: string;
  cancelled_at?: string;
  created_at: string;
}

export interface CreateReservationInput {
  outlet_id: string;
  table_id?: string;
  guest_name: string;
  guest_phone?: string;
  guest_email?: string;
  party_size: number;
  scheduled_at: string; // RFC3339
  duration_minutes?: number;
  notes?: string;
  special_requests?: string;
  source?: string;
}

export function useReservations(filters?: { date?: string; status?: string; outletId?: string; tableId?: string }) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-reservations', tenantID, filters],
    queryFn: () =>
      apiClient.get<{ data: TableReservation[]; total: number }>(`${basePath(tenantID)}/reservations`, {
        date: filters?.date,
        status: filters?.status,
        outlet_id: filters?.outletId,
        table_id: filters?.tableId,
      }),
    enabled: !!tenantID,
    staleTime: 15_000,
  });
}

export function useAvailableSlots(params: { date: string; partySize?: number; outletId?: string }) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-available-slots', tenantID, params],
    queryFn: () =>
      apiClient.get<{ date: string; tables: any[] }>(`${basePath(tenantID)}/reservations/available`, {
        date: params.date,
        party_size: params.partySize,
        outlet_id: params.outletId,
      }),
    enabled: !!tenantID && !!params.date,
    staleTime: 30_000,
  });
}

export function useCreateReservation() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReservationInput) =>
      apiClient.post<TableReservation>(`${basePath(tenantID)}/reservations`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-reservations'] });
      qc.invalidateQueries({ queryKey: ['pos-available-slots'] });
    },
  });
}

export function useUpdateReservation() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateReservationInput> }) =>
      apiClient.patch<TableReservation>(`${basePath(tenantID)}/reservations/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-reservations'] }),
  });
}

export function useConfirmReservation() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tableId }: { id: string; tableId?: string }) =>
      apiClient.post<TableReservation>(`${basePath(tenantID)}/reservations/${id}/confirm`, { table_id: tableId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-reservations'] });
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
    },
  });
}

export function useCheckInReservation() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<TableReservation>(`${basePath(tenantID)}/reservations/${id}/check-in`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-reservations'] });
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
    },
  });
}

export function useCancelReservation() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiClient.post<TableReservation>(`${basePath(tenantID)}/reservations/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-reservations'] });
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
      qc.invalidateQueries({ queryKey: ['pos-available-slots'] });
    },
  });
}

// ─── Orders ─────────────────────────────────────────────────────────────────

interface POSOrder {
  id: string;
  order_number: string;
  status: string;
  /** Money fields are serialized with omitempty server-side — zero values arrive as
   * missing keys, so consumers must treat them as optional. */
  subtotal?: number;
  tax_total?: number;
  total_amount?: number;
  currency: string;
  created_at: string;
  /** Human-readable table label (hospitality orders), e.g. "Table 4". */
  table_reference?: string;
  edges?: { lines?: any[]; payments?: any[] };
}

export function useOrder(id: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-order', tenantID, id],
    queryFn: () => apiClient.get<POSOrder>(`${basePath(tenantID)}/orders/${id}`),
    enabled: !!tenantID && !!id,
  });
}

/** Advanced All-Sales filters. All optional; omitted values are not sent. */
export interface OrderListFilters {
  status?: string;          // CSV of order statuses (e.g. "completed,refunded")
  staffId?: string;         // legacy alias for userId
  userId?: string;
  outletId?: string;        // business location; "all" lists every outlet
  from?: string;            // YYYY-MM-DD or RFC3339
  to?: string;
  customer?: string;        // phone or name (contains)
  paymentStatus?: string;   // paid | due | partial
  paymentMethod?: string;   // tender type (cash, card, cheque, bank_transfer, ...)
  shippingStatus?: string;
  source?: string;          // pos_terminal | back_office | all
  subscriptions?: boolean;
  orderNumber?: string;
  limit?: number;
  page?: number;
}

/** True when the request is the plain "latest sales" page-1 list (no filters) — the only
 *  shape the offline `recent-orders` dataset mirrors, so it's the only one that may
 *  serve/refresh that cache. */
function isDefaultOrderList(filters?: OrderListFilters): boolean {
  if (!filters) return true;
  const { limit: _l, page, ...rest } = filters;
  return (page ?? 1) === 1 && Object.values(rest).every((v) => v === undefined || v === '' || v === false);
}

export function useOrders(filters?: OrderListFilters) {
  const tenantID = useTenantID();
  const outletID = useEffectiveOutletID();
  return useQuery({
    queryKey: ['pos-orders', tenantID, filters],
    queryFn: async () => {
      const fetchList = () =>
      apiClient.get<{ data: POSOrder[]; total: number; meta?: { total: number; page: number; limit: number } }>(
        `${basePath(tenantID)}/orders`,
        {
          status: filters?.status,
          staff_id: filters?.staffId,
          user_id: filters?.userId,
          outlet_id: filters?.outletId,
          from: filters?.from,
          to: filters?.to,
          customer: filters?.customer,
          payment_status: filters?.paymentStatus,
          payment_method: filters?.paymentMethod,
          shipping_status: filters?.shippingStatus,
          source: filters?.source,
          subscriptions: filters?.subscriptions ? 'true' : undefined,
          order_number: filters?.orderNumber,
          limit: filters?.limit ?? 20,
          page: filters?.page ?? 1,
          sort: 'created_at',
          order: 'desc',
        },
      );
      // Offline resilience for the default "latest sales" list only: write it through to
      // the recent-orders dataset online, serve that cache when the network is out. Filtered
      // views still require connectivity (we never fake filtered results from a page-1 cache).
      const { kvKey, setKV, getKV } = await import('@/lib/db/kv-cache');
      const cacheKey = kvKey('recent-orders', tenantID, outletID || undefined);
      if (!isDefaultOrderList(filters)) return fetchList();
      try {
        const res = await fetchList();
        await setKV(cacheKey, tenantID, res).catch(() => {});
        return res;
      } catch (err) {
        const { isNetworkShapedError } = await import('@/lib/connectivity');
        if (isNetworkShapedError(err)) {
          const cached = await getKV<Awaited<ReturnType<typeof fetchList>>>(cacheKey);
          if (cached !== undefined) return cached;
        }
        throw err;
      }
    },
    enabled: !!tenantID,
    staleTime: 15_000,
    networkMode: 'always',
  });
}

/** Quotations for the Recent-Transactions "Quotation" tab (proxied from treasury). */
export function useQuotations(params?: { page?: number; limit?: number; status?: string }, enabled = true) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-quotations', tenantID, params],
    queryFn: () =>
      apiClient.get<{ data: any[]; total: number; meta?: { total: number } }>(
        `${basePath(tenantID)}/quotations`,
        { page: params?.page ?? 1, limit: params?.limit ?? 10, status: params?.status },
      ),
    enabled: !!tenantID && enabled,
    staleTime: 15_000,
  });
}

/** Edit Shipping (All-Sales action) — updates shipping status/address/charges. */
export function useUpdateShipping() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { orderId: string; shipping_status?: string; shipping_address?: string; shipping_amount?: number; tracking_number?: string; delivery_person?: string; delivery_phone?: string }) =>
      apiClient.patch(`${basePath(tenantID)}/orders/${data.orderId}/shipping`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-orders'] }),
  });
}

/** New Sale Notification (All-Sales action) — (re)sends the customer their receipt. */
export function useNotifySale() {
  const tenantID = useTenantID();
  return useMutation({
    mutationFn: (data: { orderId: string; phone?: string; email?: string }) =>
      apiClient.post(`${basePath(tenantID)}/orders/${data.orderId}/notify`, { phone: data.phone, email: data.email }),
  });
}

/** View Payments (All-Sales action) — lists an order's payments (detailed rows with
 * tender name/type, note and a voidable flag). */
export function useOrderPayments(orderId: string, enabled = true) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-order-payments', tenantID, orderId],
    queryFn: () => apiClient.get<any>(`${basePath(tenantID)}/orders/${orderId}/payments`),
    enabled: !!tenantID && !!orderId && enabled,
  });
}

/** Edit a recorded payment's descriptive fields — reference/note/date/tender, never the
 * amount (void + re-record to change money). Manager-only; manual tenders only. */
export function useUpdateOrderPayment() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { orderId: string; paymentId: string; reference?: string; note?: string; occurred_at?: string; tender_id?: string }) =>
      apiClient.patch(`${basePath(tenantID)}/orders/${data.orderId}/payments/${data.paymentId}`, {
        reference: data.reference, note: data.note, occurred_at: data.occurred_at, tender_id: data.tender_id,
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['pos-order-payments', tenantID, v.orderId] });
      qc.invalidateQueries({ queryKey: ['pos-orders'] });
    },
  });
}

/** Void (soft-delete) a recorded payment — reversing treasury entry, paid totals recomputed,
 * completed order reopens if no longer covered. Manager-only; manual tenders only. */
export function useVoidOrderPayment() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { orderId: string; paymentId: string; reason?: string }) =>
      apiClient.delete(`${basePath(tenantID)}/orders/${data.orderId}/payments/${data.paymentId}`, {
        data: { reason: data.reason },
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['pos-order-payments', tenantID, v.orderId] });
      qc.invalidateQueries({ queryKey: ['pos-orders'] });
    },
  });
}

/** Send the customer a payment-received confirmation for one payment (View Payments action). */
export function useNotifyOrderPayment() {
  const tenantID = useTenantID();
  return useMutation({
    mutationFn: (data: { orderId: string; paymentId: string }) =>
      apiClient.post(`${basePath(tenantID)}/orders/${data.orderId}/payments/${data.paymentId}/notify`, {}),
  });
}

export type OrderSubtype = 'dine_in' | 'takeaway' | 'room_service' | 'delivery' | 'bar_tab';

interface CreateOrderInput {
  outletId: string;
  deviceId?: string;
  currency?: string;
  orderSubtype?: OrderSubtype | 'retail';
  tableId?: string;
  discountAmount?: number;
  coversCount?: number;
  customerPhone?: string;
  customerName?: string;
  ageVerified?: boolean;
  discountReason?: string;
  approvalToken?: string;
  /** Manager quick-edit: order-level tax added on top of per-line tax. */
  orderTaxAmount?: number;
  /** Manager quick-edit: additional costs {packaging, service, shipping} included in the total. */
  charges?: Record<string, number>;
  /** Order-level metadata (e.g. delivery_address/delivery_lat/delivery_lng/delivery_notes for delivery orders). */
  metadata?: Record<string, unknown>;
  /** Origin of the sale: "pos_terminal" (default) or "back_office" (the Add Sale flow). */
  source?: 'pos_terminal' | 'back_office';
  lines: Array<{
    catalog_item_id: string;
    sku: string;
    name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    course_number?: number;
    metadata?: Record<string, unknown>;
    /** Per-line tax as charged at the till (treasury-enriched catalog) — keeps the server's
     *  payable identical to the rung-up amount (no phantom flat VAT on inclusive prices). */
    tax_code_id?: string;
    price_includes_tax?: boolean;
    tax_rate?: number;
  }>;
}

export function useCreateOrder() {
  const tenantID = useTenantID();
  const tenantSlug = useTenantSlug();
  const outletID = useOutletID();
  const isOnline = useEffectiveOnline();
  const qc = useQueryClient();
  return useMutation({
    // Generate the client reference up front and use it on BOTH paths: offline it is the
    // IndexedDB local_id; online it is sent as client_reference + Idempotency-Key so the
    // backend dedups a replayed (or lost-response) submission into a single order.
    mutationFn: async (data: CreateOrderInput) => {
      const localId = uuidv4();
      const queueOffline = async () => {
        const lines: OfflineOrderLine[] = data.lines.map((l) => ({
          catalog_item_id: l.catalog_item_id,
          sku: l.sku,
          name: l.name,
          quantity: l.quantity,
          unit_price: l.unit_price,
          total_price: l.total_price,
          tax_code_id: l.tax_code_id,
          price_includes_tax: l.price_includes_tax,
          tax_rate: l.tax_rate,
        }));
        const subtotal = lines.reduce((s, l) => s + l.total_price, 0);
        const totalAmount = Math.max(0, subtotal - (data.discountAmount ?? 0));
        await saveDraftOrder({
          local_id: localId,
          tenant_id: tenantID,
          tenant_slug: tenantSlug,
          outlet_id: data.outletId || outletID,
          currency: data.currency ?? 'KES',
          subtotal,
          tax_total: 0,
          total_amount: totalAmount,
          lines,
          created_at: new Date().toISOString(),
          synced: false,
        });
        // Shape mirrors the server order enough for the place-order → payment handoff;
        // id === local_id so downstream offline payment can attach via isLocalOrder.
        return { id: localId, order_id: localId, local_id: localId, offline: true, status: 'open' };
      };
      if (!isOnline) return queueOffline();
      try {
        const res = await apiClient.post<{ id: string; order_number: string }>(
          `${basePath(tenantID)}/orders`,
          {
            outlet_id: data.outletId,
            device_id: data.deviceId,
            currency: data.currency ?? 'KES',
            order_subtype: data.orderSubtype ?? 'dine_in',
            table_id: data.tableId,
            covers_count: data.coversCount,
            customer_phone: data.customerPhone,
            customer_name: data.customerName,
            age_verified: data.ageVerified,
            discount_amount: data.discountAmount,
            discount_reason: data.discountReason,
            order_tax_amount: data.orderTaxAmount,
            charges: data.charges,
            approval_token: data.approvalToken,
            metadata: data.metadata,
            lines: data.lines,
            client_reference: localId,
            source: data.source,
          },
          idemHeaders(localId),
        );
        return { ...res, offline: false };
      } catch (err) {
        // Write-behind: a NETWORK-shaped failure (timeout/unreachable/gateway — weak wifi
        // reads as "online") queues the sale instead of erroring at the till. Same localId
        // ⇒ if the server actually processed the lost request, the replay dedups via
        // client_reference/Idempotency-Key. Business 4xx/500 still throws.
        const { isNetworkShapedError } = await import('@/lib/connectivity');
        if (!isNetworkShapedError(err)) throw err;
        toast.info('Network unreachable — sale saved offline and will sync automatically.');
        return queueOffline();
      }
    },
    // Must run even when navigator.onLine is false — we handle offline internally
    // (write to IndexedDB). Without this, React Query pauses the mutation offline and the
    // sale is never queued.
    networkMode: 'always',
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-orders'] }),
  });
}

export function useUpdateOrderStatus() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      apiClient.patch(`${basePath(tenantID)}/orders/${orderId}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-orders'] }),
  });
}

export function useVoidOrder() {
  const tenantID = useTenantID();
  const tenantSlug = useTenantSlug();
  const isOnline = useEffectiveOnline();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, reason, approvalToken, voidCode }: { orderId: string; reason: string; approvalToken?: string; voidCode?: string }) => {
      const localId = uuidv4();
      const queueOffline = async () => {
        // If voiding an offline (not-yet-synced) order, key by local_order_id so the void
        // syncs after the order resolves a server id.
        const { getOfflineOrderByLocalId, saveDraftVoid } = await import('@/lib/db/pos-db');
        const localOrder = await getOfflineOrderByLocalId(orderId);
        await saveDraftVoid({
          local_id: localId,
          server_order_id: localOrder ? undefined : orderId,
          local_order_id: localOrder ? orderId : undefined,
          reason,
          approval_token: approvalToken,
          tenant_id: tenantID,
          tenant_slug: tenantSlug,
          created_at: new Date().toISOString(),
          synced: false,
        });
        return { offline: true };
      };
      if (!isOnline) return queueOffline();
      try {
        return await apiClient.patch(
          `${basePath(tenantID)}/orders/${orderId}/void`,
          { reason, approval_token: approvalToken, void_code: voidCode },
          idemHeaders(localId),
        );
      } catch (err) {
        // Write-behind on weak wifi — same localId, so a replay dedups server-side.
        // NOTE: void_code is validated server-side and can expire before the queue drains,
        // so only approval_token voids queue; a void-code void on a dead network still errors.
        const { isNetworkShapedError } = await import('@/lib/connectivity');
        if (!isNetworkShapedError(err) || voidCode) throw err;
        toast.info('Network unreachable — void saved offline and will sync automatically.');
        return queueOffline();
      }
    },
    networkMode: 'always',
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-orders'] }),
  });
}

/**
 * useGenerateVoidCode lets a manager generate a one-time, order-scoped code to SHARE with a
 * waiter/cashier so they can void a specific bill when the manager isn't at the terminal.
 */
export function useGenerateVoidCode() {
  const tenantID = useTenantID();
  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) =>
      apiClient.post<{ code: string; order_number: string; expires_at: string; expires_in: number; approver_name: string }>(
        `${basePath(tenantID)}/orders/${orderId}/void-code`,
        { reason },
      ),
  });
}

export function useAddOrderLines() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, lines }: { orderId: string; lines: CreateOrderInput['lines'] }) =>
      apiClient.post(`${basePath(tenantID)}/orders/${orderId}/lines`, { lines }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-orders'] });
      qc.invalidateQueries({ queryKey: ['pos-tables'] });
    },
  });
}

export function useMergeTables() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ primaryTableId, secondaryTableId }: { primaryTableId: string; secondaryTableId: string }) =>
      apiClient.post(`${basePath(tenantID)}/tables/merge`, {
        primary_table_id: primaryTableId,
        secondary_table_id: secondaryTableId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-tables'] }),
  });
}

export function useUnmergeTables() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ primaryTableId, secondaryTableId, lineIds }: { primaryTableId: string; secondaryTableId: string; lineIds: string[] }) =>
      apiClient.post(`${basePath(tenantID)}/tables/unmerge`, {
        primary_table_id: primaryTableId,
        secondary_table_id: secondaryTableId,
        line_ids: lineIds,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-tables'] }),
  });
}

// ─── Tenders ────────────────────────────────────────────────────────────────

interface Tender {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
}

export function useTenders() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['pos-tenders', tenantID],
    // IndexedDB-first: tender types must resolve offline/weak-wifi or checkout dies.
    queryFn: async () => {
      const { cacheFirst } = await import('@/lib/offline/cache-first');
      const { getDataset, datasetCacheOpts } = await import('@/lib/offline/datasets');
      return cacheFirst(datasetCacheOpts(getDataset('pos-tenders'), tenantID, undefined, qc)) as Promise<PaginatedResponse<Tender>>;
    },
    enabled: !!tenantID,
    staleTime: 5 * 60_000,
    networkMode: 'always',
  });
}

// ─── Payments ───────────────────────────────────────────────────────────────

export interface PaymentIntentResult {
  payment_intent_id: string;
  initiate_url: string;
  is_cash: boolean;
}

export function useCreatePaymentIntent() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      tenderMethod,
      amount,
      tenderId,
      currency,
      externalRef,
      paymentDueDate,
      creditNotes,
    }: {
      orderId: string;
      tenderMethod: string;
      amount: number;
      tenderId?: string;
      currency?: string;
      externalRef?: string; // cashier-entered reference for manual/paybill payments
      paymentDueDate?: string; // credit sale due date (YYYY-MM-DD, from the credit-sale modal)
      creditNotes?: string; // credit sale notes/terms
    }) =>
      apiClient.post<PaymentIntentResult>(`${basePath(tenantID)}/orders/${orderId}/payments/intent`, {
        tenderMethod,
        tenderId: tenderId ?? '00000000-0000-0000-0000-000000000000',
        amount,
        currency: currency ?? 'KES',
        externalRef,
        paymentDueDate,
        creditNotes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-orders'] });
    },
  });
}

export function useRecordPayment() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, tenderId, amount }: { orderId: string; tenderId: string; amount: number }) =>
      apiClient.post(`${basePath(tenantID)}/orders/${orderId}/payments`, {
        tenderId,
        amount,
        currency: 'KES',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-orders'] });
    },
  });
}

// ─── Cash Drawer ────────────────────────────────────────────────────────────

interface CashDrawer {
  id: string;
  status: string;
  starting_cash: number;
  ending_cash: number;
  opened_at: string;
  closed_at?: string;
}

export function useCurrentDrawer() {
  const tenantID = useTenantID();
  const isOnline = useEffectiveOnline();
  return useQuery({
    queryKey: ['pos-drawer-current', tenantID],
    // Offline (incl. cold-start, and weak-wifi "effectively offline"): serve the last-known
    // drawer snapshot so the cashier sees their open drawer instead of a blank/zero state;
    // cache it through on every online read. A network-shaped fetch failure also falls back.
    queryFn: async () => {
      const { getSnapshot, cacheSnapshot } = await import('@/lib/db/pos-db');
      const snap = () => getSnapshot<{ drawer: CashDrawer | null; isOpen: boolean }>(`drawer:${tenantID}`);
      if (!isOnline) {
        const s = await snap();
        if (s !== undefined) return s;
      }
      try {
        const res = await apiClient.get<{ drawer: CashDrawer | null; isOpen: boolean }>(`${basePath(tenantID)}/drawers/current`);
        await cacheSnapshot(`drawer:${tenantID}`, tenantID, res).catch(() => {});
        return res;
      } catch (err) {
        const s = await snap();
        if (s !== undefined) return s;
        throw err;
      }
    },
    enabled: !!tenantID,
    staleTime: 5_000,
    refetchInterval: isOnline ? 30_000 : false,
    networkMode: 'always',
  });
}

// ─── Device Sessions (Shifts) ────────────────────────────────────────────────

interface DeviceSession {
  id: string;
  status: string;
  session_status: string;
  float_amount: number;
  opened_at: string;
  closed_at?: string;
  user_id?: string;
}

interface SessionSummary {
  cash_in_total: number;
  card_total: number;
  mpesa_total: number;
  total_revenue: number;
  order_count: number;
  void_count: number;
  expected_cash: number;
  opening_float: number;
}

export function useCurrentShift() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-session-current', tenantID],
    queryFn: () =>
      apiClient.get<DeviceSession>(`${basePath(tenantID)}/devices/current/sessions/current`),
    enabled: !!tenantID,
    retry: (count, err: any) => err?.response?.status !== 404 && count < 2,
    staleTime: 30_000,
  });
}

export function useShiftSummary() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-session-summary', tenantID],
    queryFn: () =>
      apiClient.get<SessionSummary>(`${basePath(tenantID)}/devices/current/sessions/current/summary`),
    enabled: !!tenantID,
    retry: (count, err: any) => err?.response?.status !== 404 && count < 2,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useOpenShift() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { floatAmount?: number }) =>
      apiClient.post<DeviceSession>(`${basePath(tenantID)}/devices/current/sessions/open`, {
        float_amount: data.floatAmount ?? 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-session-current'] });
      qc.invalidateQueries({ queryKey: ['pos-session-summary'] });
    },
  });
}

export function useCloseShift() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { endingCash?: number }) =>
      apiClient.post<DeviceSession>(`${basePath(tenantID)}/devices/current/sessions/close`, {
        closing_float: data.endingCash ?? 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-session-current'] });
      qc.invalidateQueries({ queryKey: ['pos-session-summary'] });
    },
    onError: (e: any) => {
      // Shift-close guard: the backend blocks closing while the waiter has set-aside items still
      // unclaimed. Surface a clear, actionable message (resolve them in Tables → My Bills).
      const data = e?.response?.data;
      if (e?.response?.status === 409 && data?.code === 'held_items_outstanding') {
        toast.error(`You have ${data.held_count ?? ''} set-aside item(s) to claim or void before closing your shift (Tables → My Bills).`);
      }
    },
  });
}

export function useOpenDrawer() {
  const tenantID = useTenantID();
  const tenantSlug = useTenantSlug();
  const outletID = useOutletID();
  const isOnline = useEffectiveOnline();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { outletId: string; startingCash: number; deviceId?: string }) => {
      const localId = uuidv4();
      const queueOffline = async () => {
        await saveDraftDrawerSession({
          local_id: localId,
          tenant_id: tenantID,
          tenant_slug: tenantSlug,
          outlet_id: data.outletId || outletID,
          starting_cash: data.startingCash,
          opened_at: new Date().toISOString(),
          synced: false,
        });
        return { id: localId, local_id: localId, offline: true };
      };
      if (!isOnline) return queueOffline();
      try {
        return await apiClient.post(`${basePath(tenantID)}/drawers/open`, data, idemHeaders(localId));
      } catch (err) {
        const { isNetworkShapedError } = await import('@/lib/connectivity');
        if (!isNetworkShapedError(err)) throw err;
        toast.info('Network unreachable — drawer opened offline and will sync automatically.');
        return queueOffline();
      }
    },
    networkMode: 'always',
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-drawer-current'] });
      qc.invalidateQueries({ queryKey: ['pos-session-current'] });
    },
  });
}

export function useCloseDrawer() {
  const tenantID = useTenantID();
  const tenantSlug = useTenantSlug();
  const isOnline = useEffectiveOnline();
  const qc = useQueryClient();
  return useMutation({
    // isLocalDrawer = the drawer was opened offline and hasn't synced yet (drawerId is a
    // local uuid). The close is queued against local_drawer_id and applied after the
    // session syncs and resolves a server id.
    mutationFn: async ({ drawerId, endingCash, isLocalDrawer = false }: { drawerId: string; endingCash: number; isLocalDrawer?: boolean }) => {
      const queueOffline = async () => {
        await saveDraftDrawerClose({
          server_drawer_id: isLocalDrawer ? undefined : drawerId,
          local_drawer_id: isLocalDrawer ? drawerId : undefined,
          ending_cash: endingCash,
          closed_at: new Date().toISOString(),
          tenant_id: tenantID,
          tenant_slug: tenantSlug,
          synced: false,
        });
        return { offline: true };
      };
      if (!isOnline) return queueOffline();
      try {
        return await apiClient.post(
          `${basePath(tenantID)}/drawers/${drawerId}/close`,
          { endingCash },
          idemHeaders(`close-${drawerId}`),
        );
      } catch (err) {
        const { isNetworkShapedError } = await import('@/lib/connectivity');
        if (!isNetworkShapedError(err)) throw err;
        toast.info('Network unreachable — drawer close saved offline and will sync automatically.');
        return queueOffline();
      }
    },
    networkMode: 'always',
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-drawer-current'] }),
  });
}

export function useDrawerHistory() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-drawer-history', tenantID],
    queryFn: () =>
      apiClient.get<PaginatedResponse<CashDrawer>>(`${basePath(tenantID)}/drawers`),
    enabled: !!tenantID,
    staleTime: 30_000,
  });
}
