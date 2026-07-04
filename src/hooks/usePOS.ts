'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  cacheCatalogItems,
  getCachedCatalog,
  saveDraftOrder,
  saveDraftDrawerSession,
  saveDraftDrawerClose,
  type OfflineCatalogItem,
  type OfflineOrderLine,
} from '@/lib/db/pos-db';
import { useOnline } from '@/hooks/use-online';
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

/** Write fetched catalog rows through to the IndexedDB offline cache (best-effort,
 *  non-blocking) so the terminal keeps working — and reopens instantly — offline.
 *  Maps the rich catalog DTO to the lean OfflineCatalogItem shape used by pos-db. */
export function cacheCatalogPage(tenantID: string, items: CatalogItem[] | undefined): void {
  if (!tenantID || !items?.length) return;
  const now = new Date().toISOString();
  const rows: OfflineCatalogItem[] = items.map((i) => ({
    id: i.id,
    tenant_id: tenantID,
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
  void cacheCatalogItems(rows).catch(() => { /* offline cache is best-effort */ });
}

export function useMenuItems(filters?: {
  category?: string;
  search?: string;
  itemType?: string;
  page?: number;
  limit?: number;
}) {
  const tenantID = useTenantID();
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 50;
  return useQuery({
    queryKey: ['pos-catalog-items', tenantID, filters?.category, filters?.search, filters?.itemType, page, limit],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<CatalogItem>>(`${basePath(tenantID)}/catalog/items`, {
        category: filters?.category,
        search: filters?.search,
        item_type: filters?.itemType,
        page,
        limit,
      });
      // Keep the offline catalog cache fresh as the cashier browses (prices/availability).
      cacheCatalogPage(tenantID, res?.data);
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
async function fetchAllCatalogItems(tenantID: string): Promise<CatalogItem[]> {
  const limit = 200;
  const all: CatalogItem[] = [];
  for (let page = 1; page <= 100; page++) {
    const res = await apiClient.get<PaginatedResponse<CatalogItem>>(
      `${basePath(tenantID)}/catalog/items`,
      { page, limit },
    );
    const batch = res?.data ?? [];
    all.push(...batch);
    const total = res?.total ?? all.length;
    if (batch.length < limit || all.length >= total) break;
  }
  return all;
}

/**
 * Load the full catalog with the local cache as the first source of truth:
 *  - Online  → fetch every page from the API, write ALL items through to IndexedDB
 *              (upsert — the local cache keeps improving), and return the fresh set.
 *              If the network fails mid-session, fall back to whatever is cached.
 *  - Offline → serve the complete IndexedDB cache.
 * Shared by `useFullCatalog` (terminal) and the shell-level prewarm so there is one
 * code path and one query-cache key.
 */
export async function loadFullCatalog(tenantID: string, isOnline: boolean): Promise<CatalogItem[]> {
  if (!tenantID) return [];
  if (!isOnline) {
    const cached = await getCachedCatalog(tenantID);
    return cached.map(offlineToCatalogItem);
  }
  try {
    const all = await fetchAllCatalogItems(tenantID);
    cacheCatalogPage(tenantID, all); // write-through (best-effort, non-blocking)
    return all;
  } catch (err) {
    const cached = await getCachedCatalog(tenantID);
    if (cached.length) return cached.map(offlineToCatalogItem);
    throw err;
  }
}

export const FULL_CATALOG_QUERY_KEY = 'pos-catalog-full';

/**
 * The terminal's catalog source. Returns the COMPLETE catalog so the terminal can
 * resolve category/search/brand/pagination locally over the full set. It is
 * cache-first: the shell prewarm seeds this query from IndexedDB before the terminal
 * mounts (instant paint), and every fetch revalidates from the API and refreshes the
 * IndexedDB cache. Falls back to the local cache when offline or on network error.
 */
export function useFullCatalog() {
  const tenantID = useTenantID();
  const isOnline = useOnline();
  return useQuery({
    queryKey: [FULL_CATALOG_QUERY_KEY, tenantID],
    queryFn: () => loadFullCatalog(tenantID, isOnline),
    enabled: !!tenantID,
    staleTime: 5 * 60_000,
    networkMode: 'always',
    placeholderData: (prev) => prev,
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
  return useQuery({
    queryKey: ['pos-categories', tenantID],
    queryFn: () =>
      apiClient.get<{ data: RawCategory[] }>(`${basePath(tenantID)}/catalog/categories`),
    enabled: !!tenantID,
    staleTime: 10 * 60_000,
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
  subtotal: number;
  tax_total: number;
  total_amount: number;
  currency: string;
  created_at: string;
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

export function useOrders(filters?: { status?: string; staffId?: string; limit?: number; page?: number }) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-orders', tenantID, filters],
    queryFn: () =>
      apiClient.get<{ data: POSOrder[]; total: number; meta?: { total: number; page: number; limit: number } }>(
        `${basePath(tenantID)}/orders`,
        {
          status: filters?.status,
          staff_id: filters?.staffId,
          limit: filters?.limit ?? 20,
          page: filters?.page ?? 1,
          sort: 'created_at',
          order: 'desc',
        },
      ),
    enabled: !!tenantID,
    staleTime: 15_000,
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
  /** Order-level metadata (e.g. delivery_address/delivery_lat/delivery_lng/delivery_notes for delivery orders). */
  metadata?: Record<string, unknown>;
  lines: Array<{
    catalog_item_id: string;
    sku: string;
    name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    course_number?: number;
    metadata?: Record<string, unknown>;
  }>;
}

export function useCreateOrder() {
  const tenantID = useTenantID();
  const tenantSlug = useTenantSlug();
  const outletID = useOutletID();
  const isOnline = useOnline();
  const qc = useQueryClient();
  return useMutation({
    // Generate the client reference up front and use it on BOTH paths: offline it is the
    // IndexedDB local_id; online it is sent as client_reference + Idempotency-Key so the
    // backend dedups a replayed (or lost-response) submission into a single order.
    mutationFn: async (data: CreateOrderInput) => {
      const localId = uuidv4();
      if (!isOnline) {
        const lines: OfflineOrderLine[] = data.lines.map((l) => ({
          catalog_item_id: l.catalog_item_id,
          sku: l.sku,
          name: l.name,
          quantity: l.quantity,
          unit_price: l.unit_price,
          total_price: l.total_price,
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
      }
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
          approval_token: data.approvalToken,
          metadata: data.metadata,
          lines: data.lines,
          client_reference: localId,
        },
        idemHeaders(localId),
      );
      return { ...res, offline: false };
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
  const isOnline = useOnline();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, reason, approvalToken, voidCode }: { orderId: string; reason: string; approvalToken?: string; voidCode?: string }) => {
      const localId = uuidv4();
      if (!isOnline) {
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
      }
      return apiClient.patch(
        `${basePath(tenantID)}/orders/${orderId}/void`,
        { reason, approval_token: approvalToken, void_code: voidCode },
        idemHeaders(localId),
      );
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
  return useQuery({
    queryKey: ['pos-tenders', tenantID],
    queryFn: () => apiClient.get<PaginatedResponse<Tender>>(`${basePath(tenantID)}/tenders`),
    enabled: !!tenantID,
    staleTime: 5 * 60_000,
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
    }: {
      orderId: string;
      tenderMethod: string;
      amount: number;
      tenderId?: string;
      currency?: string;
      externalRef?: string; // cashier-entered reference for manual/paybill payments
    }) =>
      apiClient.post<PaymentIntentResult>(`${basePath(tenantID)}/orders/${orderId}/payments/intent`, {
        tenderMethod,
        tenderId: tenderId ?? '00000000-0000-0000-0000-000000000000',
        amount,
        currency: currency ?? 'KES',
        externalRef,
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
  const isOnline = useOnline();
  return useQuery({
    queryKey: ['pos-drawer-current', tenantID],
    // Offline (incl. cold-start): serve the last-known drawer snapshot so the cashier sees
    // their open drawer instead of a blank/zero state; cache it through on every online read.
    queryFn: async () => {
      const { getSnapshot, cacheSnapshot } = await import('@/lib/db/pos-db');
      if (!navigator.onLine) {
        const snap = await getSnapshot<{ drawer: CashDrawer | null; isOpen: boolean }>(`drawer:${tenantID}`);
        if (snap !== undefined) return snap;
      }
      const res = await apiClient.get<{ drawer: CashDrawer | null; isOpen: boolean }>(`${basePath(tenantID)}/drawers/current`);
      await cacheSnapshot(`drawer:${tenantID}`, tenantID, res).catch(() => {});
      return res;
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
        ending_cash: data.endingCash ?? 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-session-current'] });
      qc.invalidateQueries({ queryKey: ['pos-session-summary'] });
    },
  });
}

export function useOpenDrawer() {
  const tenantID = useTenantID();
  const tenantSlug = useTenantSlug();
  const outletID = useOutletID();
  const isOnline = useOnline();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { outletId: string; startingCash: number; deviceId?: string }) => {
      const localId = uuidv4();
      if (!isOnline) {
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
      }
      return apiClient.post(`${basePath(tenantID)}/drawers/open`, data, idemHeaders(localId));
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
  const isOnline = useOnline();
  const qc = useQueryClient();
  return useMutation({
    // isLocalDrawer = the drawer was opened offline and hasn't synced yet (drawerId is a
    // local uuid). The close is queued against local_drawer_id and applied after the
    // session syncs and resolves a server id.
    mutationFn: async ({ drawerId, endingCash, isLocalDrawer = false }: { drawerId: string; endingCash: number; isLocalDrawer?: boolean }) => {
      if (!isOnline) {
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
      }
      return apiClient.post(
        `${basePath(tenantID)}/drawers/${drawerId}/close`,
        { endingCash },
        idemHeaders(`close-${drawerId}`),
      );
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
