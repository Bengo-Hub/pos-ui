'use client';

/**
 * Offline-aware wrappers for core POS operations.
 *
 * Each hook checks navigator.onLine before every mutation:
 *  - Online  → hit pos-api directly (normal path)
 *  - Offline → write to Dexie IndexedDB; useSyncOfflineOrders drains the queue on reconnect
 *
 * These hooks are drop-in replacements for the plain usePOS.ts equivalents.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOnline } from '@/hooks/use-online';
import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/api/client';
import { v4 as uuidv4 } from 'uuid';
import {
  cacheCatalogItems,
  getCachedCatalog,
  saveDraftOrder,
  savePendingPayment,
  saveDraftDrawerSession,
  saveDraftDrawerClose,
  type OfflineCatalogItem,
  type OfflineOrderLine,
} from '@/lib/db/pos-db';

// ── Auth helpers ───────────────────────────────────────────────────────────────

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}
function useTenantSlug() {
  return useAuthStore((s) => s.user?.tenant_slug ?? s.user?.tenant_id ?? '');
}
function useOutletID() {
  // outlet_id is not in the SSO JWT profile; falls back to empty string for offline drafts
  return useAuthStore((s) => (s.user as (typeof s.user & { outlet_id?: string }) | null)?.outlet_id ?? '');
}
function basePath(tenantID: string) {
  return `/api/v1/${tenantID}/pos`;
}

/** Idempotency-Key header so the backend dedups a replayed/lost-response request. */
function idemHeaders(key: string) {
  return { headers: { 'Idempotency-Key': key } };
}

// ── Catalog ────────────────────────────────────────────────────────────────────

interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit_price?: number;
  tax_status?: string;
  taxStatus?: string;
  status: string;
  image_url?: string;
  barcode?: string;
  metadata?: Record<string, any>;
}

interface ListResponse<T> {
  data: T[];
  total: number;
}

/**
 * Catalog with IndexedDB cache fallback.
 * On successful fetch: writes items to IndexedDB.
 * When offline: reads from IndexedDB cache.
 */
export function useMenuItemsOffline(filters?: { category?: string; search?: string }) {
  const tenantID = useTenantID();
  // Effective outlet — the catalog is outlet-scoped server-side, so both the cache key and
  // the IndexedDB read/write must carry it (see usePOS.useEffectiveOutletID).
  const effectiveOutletID = useAuthStore(
    (s) => s.selectedOutletId ?? s.outlet?.id ?? (s.user as (typeof s.user & { outlet_id?: string }) | null)?.outlet_id ?? '',
  );
  const isOnline = useOnline();

  return useQuery({
    queryKey: ['pos-catalog-items-offline', tenantID, effectiveOutletID, filters, isOnline],
    queryFn: async (): Promise<ListResponse<CatalogItem>> => {
      if (!isOnline) {
        const cached = await getCachedCatalog(tenantID, effectiveOutletID);
        let items = cached.map((c) => ({
          id: c.id,
          sku: c.sku,
          name: c.name,
          category: c.category,
          unit_price: c.unit_price,
          tax_status: c.tax_status,
          status: c.status,
          image_url: c.image_url,
          barcode: c.barcode,
          metadata: c.metadata,
        }));
        if (filters?.category) items = items.filter((i) => i.category === filters.category);
        if (filters?.search) {
          const q = filters.search.toLowerCase();
          items = items.filter((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q));
        }
        return { data: items, total: items.length };
      }

      const result = await apiClient.get<ListResponse<CatalogItem>>(
        `${basePath(tenantID)}/catalog/items`,
        { category: filters?.category, search: filters?.search, limit: 200 }
      );

      // Write to IndexedDB for offline use
      const now = new Date().toISOString();
      const toCache: OfflineCatalogItem[] = (result.data ?? []).map((item) => ({
        id: item.id,
        tenant_id: tenantID,
        outlet_id: effectiveOutletID || undefined,
        sku: item.sku,
        name: item.name,
        category: item.category ?? '',
        unit_price: item.unit_price ?? 0,
        tax_status: item.tax_status ?? item.taxStatus ?? 'taxable',
        status: item.status,
        image_url: item.image_url,
        barcode: item.barcode,
        metadata: item.metadata,
        cached_at: now,
      }));
      await cacheCatalogItems(toCache).catch(() => { /* non-fatal */ });

      return result;
    },
    enabled: !!tenantID,
    staleTime: 5 * 60_000,
    // Always run queryFn regardless of network — we handle offline internally
    networkMode: 'always',
    retry: isOnline ? 2 : false,
  });
}

// ── Order creation ─────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  outletId: string;
  deviceId?: string;
  currency?: string;
  lines: Array<{
    catalog_item_id: string;
    sku: string;
    name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  subtotal?: number;
  taxTotal?: number;
  totalAmount?: number;
  // When provided, a cash payment is bundled with the offline order for sync
  pendingPayment?: {
    tender_id: string;
    tender_method: string;
    amount: number;
    external_ref?: string;
  };
}

/**
 * Order creation with offline fallback.
 * Online  → POST /pos/orders → returns server order_id
 * Offline → writes to offlineOrders IndexedDB → returns { local_id, offline: true }
 */
export function useCreateOrderOffline() {
  const tenantID = useTenantID();
  const tenantSlug = useTenantSlug();
  const outletID = useOutletID();
  const isOnline = useOnline();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateOrderInput) => {
      // Generate the client reference up front and use it on BOTH paths: offline it is
      // the IndexedDB local_id; online it is sent as client_reference + Idempotency-Key so
      // even a "request succeeded but response lost" retry can't create a duplicate order.
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
        const subtotal = data.subtotal ?? lines.reduce((s, l) => s + l.total_price, 0);
        const taxTotal = data.taxTotal ?? 0;
        const totalAmount = data.totalAmount ?? subtotal + taxTotal;

        await saveDraftOrder({
          local_id: localId,
          tenant_id: tenantID,
          tenant_slug: tenantSlug,
          outlet_id: data.outletId || outletID,
          currency: data.currency ?? 'KES',
          subtotal,
          tax_total: taxTotal,
          total_amount: totalAmount,
          lines,
          created_at: new Date().toISOString(),
          synced: false,
          pending_payment: data.pendingPayment,
        });

        return { local_id: localId, offline: true, order_id: null };
      }

      const res = await apiClient.post<{ id: string; order_number: string }>(
        `${basePath(tenantID)}/orders`,
        {
          outlet_id: data.outletId,
          device_id: data.deviceId,
          currency: data.currency ?? 'KES',
          lines: data.lines,
          client_reference: localId,
        },
        idemHeaders(localId)
      );
      return { ...res, local_id: localId, offline: false, order_id: res.id };
    },
    onSuccess: () => {
      if (isOnline) qc.invalidateQueries({ queryKey: ['pos-orders'] });
    },
    networkMode: 'always',
  });
}

// ── Cash drawer ────────────────────────────────────────────────────────────────

/**
 * Open drawer with offline fallback.
 * Online  → POST /pos/drawers/open
 * Offline → saves to drawerSessions IndexedDB
 */
export function useOpenDrawerOffline() {
  const tenantID = useTenantID();
  const tenantSlug = useTenantSlug();
  const outletID = useOutletID();
  const isOnline = useOnline();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: { outletId?: string; startingCash: number }) => {
      const localId = uuidv4();
      if (!isOnline) {
        await saveDraftDrawerSession({
          local_id: localId,
          tenant_id: tenantID,
          tenant_slug: tenantSlug,
          outlet_id: data.outletId ?? outletID,
          starting_cash: data.startingCash,
          opened_at: new Date().toISOString(),
          synced: false,
        });
        return { local_id: localId, offline: true };
      }
      return apiClient.post(`${basePath(tenantID)}/drawers/open`, data, idemHeaders(localId));
    },
    onSuccess: () => {
      if (isOnline) qc.invalidateQueries({ queryKey: ['pos-drawer-current'] });
    },
    networkMode: 'always',
  });
}

/**
 * Close drawer with offline fallback.
 * Online  → POST /pos/drawers/{id}/close
 * Offline → saves to drawerCloses IndexedDB; drawer is marked closed locally
 */
export function useCloseDrawerOffline() {
  const tenantID = useTenantID();
  const tenantSlug = useTenantSlug();
  const isOnline = useOnline();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      drawerId,
      endingCash,
      isLocalDrawer = false,
    }: {
      drawerId: string;
      endingCash: number;
      isLocalDrawer?: boolean;
    }) => {
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
        idemHeaders(`close-${drawerId}`)
      );
    },
    onSuccess: () => {
      if (isOnline) qc.invalidateQueries({ queryKey: ['pos-drawer-current'] });
    },
    networkMode: 'always',
  });
}

/**
 * Record a cash payment with offline fallback.
 * Online  → POST /pos/orders/{id}/payments/intent
 * Offline → saves to offlinePayments IndexedDB
 */
export function useRecordPaymentOffline() {
  const tenantID = useTenantID();
  const tenantSlug = useTenantSlug();
  const isOnline = useOnline();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      tenderId = '00000000-0000-0000-0000-000000000000',
      tenderMethod,
      amount,
      currency = 'KES',
      externalRef,
      isLocalOrder = false,
    }: {
      orderId: string;
      tenderId?: string;
      tenderMethod: string;
      amount: number;
      currency?: string;
      externalRef?: string;
      isLocalOrder?: boolean;
    }) => {
      if (!isOnline) {
        await savePendingPayment({
          server_order_id: isLocalOrder ? undefined : orderId,
          local_order_id: isLocalOrder ? orderId : undefined,
          tender_id: tenderId,
          tender_method: tenderMethod,
          amount,
          currency,
          external_ref: externalRef,
          tenant_slug: tenantSlug,
          tenant_id: tenantID,
          created_at: new Date().toISOString(),
          synced: false,
        });
        return { offline: true };
      }
      return apiClient.post(
        `${basePath(tenantID)}/orders/${orderId}/payments/intent`,
        { tenderMethod, tenderId, amount, currency, externalRef },
        idemHeaders(`pay-${orderId}-${externalRef ?? amount}`)
      );
    },
    onSuccess: () => {
      if (isOnline) qc.invalidateQueries({ queryKey: ['pos-orders'] });
    },
    networkMode: 'always',
  });
}
