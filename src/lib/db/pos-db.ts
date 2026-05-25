import Dexie, { type Table } from 'dexie';

// ── Catalog ────────────────────────────────────────────────────────────────────

export interface OfflineCatalogItem {
  id: string; // server ID (PK for IndexedDB)
  tenant_id: string;
  sku: string;
  name: string;
  category: string;
  unit_price: number;
  tax_status: string;
  status: string;
  image_url?: string;
  barcode?: string;
  metadata?: Record<string, any>;
  cached_at: string;
}

// ── Orders ─────────────────────────────────────────────────────────────────────

export interface OfflineOrderLine {
  catalog_item_id: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface OfflineOrder {
  id?: number; // Dexie auto-increment PK
  local_id: string; // uuid generated client-side
  tenant_id: string;
  tenant_slug: string;
  outlet_id: string;
  currency: string;
  subtotal: number;
  tax_total: number;
  total_amount: number;
  lines: OfflineOrderLine[];
  created_at: string;
  synced: boolean;
  sync_error?: string;
  server_order_id?: string; // filled after successful sync
  // Cash payment info — stored together so sync worker can record payment after creating order
  pending_payment?: {
    tender_id: string;
    tender_method: string;
    amount: number;
    external_ref?: string;
  };
}

// ── Payments ───────────────────────────────────────────────────────────────────

export interface OfflinePayment {
  id?: number;
  // server_order_id: order already exists on server (payment failed while offline)
  server_order_id?: string;
  // local_order_id: order itself was created offline (payment bundled with order sync)
  local_order_id?: string;
  tender_id: string;
  tender_method: string;
  amount: number;
  currency: string;
  external_ref?: string;
  tenant_slug: string;
  tenant_id?: string;
  created_at: string;
  synced: boolean;
  sync_error?: string;
}

// ── Cash Drawer ────────────────────────────────────────────────────────────────

export interface OfflineDrawerSession {
  id?: number;
  local_id: string;
  tenant_id: string;
  tenant_slug: string;
  outlet_id: string;
  starting_cash: number;
  opened_at: string;
  synced: boolean;
  sync_error?: string;
  server_drawer_id?: string;
}

export interface OfflineDrawerClose {
  id?: number;
  server_drawer_id?: string; // for drawers already on server
  local_drawer_id?: string; // for drawers opened offline
  ending_cash: number;
  closed_at: string;
  tenant_id: string;
  tenant_slug: string;
  synced: boolean;
  sync_error?: string;
}

// ── eTIMS offline queue ────────────────────────────────────────────────────────

export interface OfflineETIMSSubmission {
  id?: number;
  order_id: string; // server order ID (known at sale time)
  local_order_id?: string; // set if order was created offline and not yet synced
  tenant_id: string;
  tenant_slug: string;
  invoice_data: Record<string, any>; // full eTIMS payload built client-side
  status: 'pending' | 'submitted' | 'failed';
  error?: string;
  created_at: string;
  synced: boolean;
}

// ── Staff / Auth ───────────────────────────────────────────────────────────────

export interface CachedStaffProfile {
  user_id: string; // PK
  tenant_id: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
  pin_hash?: string; // bcrypt hash set by manager; validated offline
  cached_at: string;
}

// ── Database ───────────────────────────────────────────────────────────────────

class POSDatabase extends Dexie {
  catalogItems!: Table<OfflineCatalogItem, string>;
  offlineOrders!: Table<OfflineOrder, number>;
  offlinePayments!: Table<OfflinePayment, number>;
  drawerSessions!: Table<OfflineDrawerSession, number>;
  drawerCloses!: Table<OfflineDrawerClose, number>;
  staffProfiles!: Table<CachedStaffProfile, string>;
  etimsQueue!: Table<OfflineETIMSSubmission, number>;

  constructor() {
    super('pos_offline_db');

    this.version(2).stores({
      catalogItems:   'id, tenant_id, sku, category, status, cached_at',
      offlineOrders:  '++id, local_id, tenant_id, synced, created_at',
      offlinePayments:'++id, local_order_id, server_order_id, tenant_id, synced',
      drawerSessions: '++id, local_id, tenant_id, synced',
      drawerCloses:   '++id, server_drawer_id, local_drawer_id, tenant_id, synced',
      staffProfiles:  'user_id, tenant_id',
    });

    this.version(3).stores({
      catalogItems:   'id, tenant_id, sku, category, status, cached_at',
      offlineOrders:  '++id, local_id, tenant_id, synced, created_at',
      offlinePayments:'++id, local_order_id, server_order_id, tenant_id, synced',
      drawerSessions: '++id, local_id, tenant_id, synced',
      drawerCloses:   '++id, server_drawer_id, local_drawer_id, tenant_id, synced',
      staffProfiles:  'user_id, tenant_id',
      etimsQueue:     '++id, order_id, tenant_id, synced, status, created_at',
    });
  }
}

export const posDB = new POSDatabase();

// ── Catalog helpers ────────────────────────────────────────────────────────────

export async function cacheCatalogItems(items: OfflineCatalogItem[]): Promise<void> {
  await posDB.catalogItems.bulkPut(items);
}

export async function getCachedCatalog(tenantId: string): Promise<OfflineCatalogItem[]> {
  return posDB.catalogItems.where('tenant_id').equals(tenantId).toArray();
}

// ── Order helpers ──────────────────────────────────────────────────────────────

export async function saveDraftOrder(order: Omit<OfflineOrder, 'id'>): Promise<number> {
  return posDB.offlineOrders.add(order);
}

export async function getPendingSyncOrders(): Promise<OfflineOrder[]> {
  return posDB.offlineOrders.where('synced').equals(0).toArray();
}

export async function markOrderSynced(localId: string, serverOrderId: string): Promise<void> {
  await posDB.offlineOrders
    .where('local_id').equals(localId)
    .modify({ synced: true, server_order_id: serverOrderId, sync_error: undefined });
}

export async function markOrderSyncFailed(localId: string, error: string): Promise<void> {
  await posDB.offlineOrders.where('local_id').equals(localId).modify({ sync_error: error });
}

// ── Payment helpers ────────────────────────────────────────────────────────────

export async function savePendingPayment(payment: Omit<OfflinePayment, 'id'>): Promise<number> {
  return posDB.offlinePayments.add(payment);
}

export async function getPendingSyncPayments(): Promise<OfflinePayment[]> {
  return posDB.offlinePayments.where('synced').equals(0).toArray();
}

export async function markPaymentSynced(id: number): Promise<void> {
  await posDB.offlinePayments.update(id, { synced: true, sync_error: undefined });
}

export async function markPaymentSyncFailed(id: number, error: string): Promise<void> {
  await posDB.offlinePayments.update(id, { sync_error: error });
}

// ── Drawer session helpers ─────────────────────────────────────────────────────

export async function saveDraftDrawerSession(session: Omit<OfflineDrawerSession, 'id'>): Promise<number> {
  return posDB.drawerSessions.add(session);
}

export async function getPendingSyncDrawerSessions(): Promise<OfflineDrawerSession[]> {
  return posDB.drawerSessions.where('synced').equals(0).toArray();
}

export async function markDrawerSessionSynced(localId: string, serverDrawerId: string): Promise<void> {
  await posDB.drawerSessions
    .where('local_id').equals(localId)
    .modify({ synced: true, server_drawer_id: serverDrawerId, sync_error: undefined });
}

export async function saveDraftDrawerClose(close: Omit<OfflineDrawerClose, 'id'>): Promise<number> {
  return posDB.drawerCloses.add(close);
}

export async function getPendingSyncDrawerCloses(): Promise<OfflineDrawerClose[]> {
  return posDB.drawerCloses.where('synced').equals(0).toArray();
}

export async function markDrawerCloseSynced(id: number): Promise<void> {
  await posDB.drawerCloses.update(id, { synced: true, sync_error: undefined });
}

// ── Staff profile helpers ──────────────────────────────────────────────────────

export async function cacheStaffProfile(profile: CachedStaffProfile): Promise<void> {
  await posDB.staffProfiles.put(profile);
}

export async function getCachedStaffProfiles(tenantId: string): Promise<CachedStaffProfile[]> {
  return posDB.staffProfiles.where('tenant_id').equals(tenantId).toArray();
}

export async function getCachedStaffProfile(userId: string): Promise<CachedStaffProfile | undefined> {
  return posDB.staffProfiles.get(userId);
}

// ── eTIMS queue helpers ────────────────────────────────────────────────────────

export async function queueETIMSSubmission(
  submission: Omit<OfflineETIMSSubmission, 'id'>
): Promise<number> {
  return posDB.etimsQueue.add(submission);
}

export async function getPendingETIMSSubmissions(): Promise<OfflineETIMSSubmission[]> {
  return posDB.etimsQueue.where('synced').equals(0).toArray();
}

export async function markETIMSSubmissionSynced(id: number): Promise<void> {
  await posDB.etimsQueue.update(id, { synced: true, status: 'submitted', error: undefined });
}

export async function markETIMSSubmissionFailed(id: number, error: string): Promise<void> {
  await posDB.etimsQueue.update(id, { status: 'failed', error });
}
