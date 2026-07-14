import Dexie, { type Table } from 'dexie';

// ── Catalog ────────────────────────────────────────────────────────────────────

export interface OfflineCatalogItem {
  id: string; // server ID (PK for IndexedDB)
  tenant_id: string;
  /** Outlet the row was fetched for. The pos-api catalog is OUTLET-scoped (use-case filtered),
   *  so cached rows must never be served to a different outlet — a hospitality menu leaking
   *  onto a retail till came from exactly that. Missing on legacy rows (pre-scoping). */
  outlet_id?: string;
  sku: string;
  name: string;
  category: string;
  unit_price: number;
  tax_status: string;
  status: string;
  image_url?: string;
  barcode?: string;
  metadata?: Record<string, any>;
  // Per-item tax (from treasury via inventory) — REQUIRED so the offline/seed terminal computes
  // the SAME per-line VAT as the online cart (see cart-tax.ts). Stripping these silently fell back
  // to the flat outlet rate for every line — double-taxing inclusive items.
  tax_rate?: number;
  tax_inclusive?: boolean;
  net_price?: number;
  tax_amount?: number;
  tax_code_id?: string;
  // Manager-only supplier cost — carried so the cost/margin columns work offline and on the
  // cache-seed paint (pos-api only serialises it to permitted callers, so a cashier's cache
  // never holds it). undefined for non-managers / items with no cost.
  cost_price?: number;
  non_billable?: boolean;
  cached_at: string;
}

// ── Sync state (shared by every outbound queue) ──────────────────────────────────
//
// Each queued mutation moves through: pending → (in-flight) → synced | retryable | dead.
// We don't persist an explicit "in-flight" flag (the drain is single-threaded per tab);
// instead retryable rows carry next_attempt_at (exponential backoff) and terminal rows
// are marked dead_letter so they stop auto-retrying and surface for manual review.
export interface SyncState {
  synced: boolean;
  sync_error?: string;
  attempts?: number;
  next_attempt_at?: string; // ISO; do not retry before this time
  dead_letter?: boolean; // terminal failure — stop auto-retrying, needs manual review
}

/** Max auto-retries before a row is dead-lettered. */
export const MAX_SYNC_ATTEMPTS = 8;

/**
 * Compute the next sync-state after a failed attempt. Terminal (4xx validation) failures
 * dead-letter immediately — replaying won't change the outcome. Retryable (network/5xx)
 * failures back off exponentially with jitter, dead-lettering after MAX_SYNC_ATTEMPTS.
 */
export function nextRetryState(
  current: { attempts?: number },
  error: string,
  opts: { terminal?: boolean; now?: number } = {},
): Pick<SyncState, 'attempts' | 'next_attempt_at' | 'dead_letter' | 'sync_error'> {
  const attempts = (current.attempts ?? 0) + 1;
  const now = opts.now ?? Date.now();
  if (opts.terminal || attempts >= MAX_SYNC_ATTEMPTS) {
    return { attempts, sync_error: error, dead_letter: true, next_attempt_at: undefined };
  }
  // 2^n seconds capped at 5 min, +/- 20% jitter so reconnecting terminals don't sync in lockstep.
  const baseMs = Math.min(2 ** attempts * 1000, 5 * 60_000);
  const jitter = baseMs * (0.8 + ((attempts * 37) % 40) / 100); // deterministic pseudo-jitter
  return { attempts, sync_error: error, next_attempt_at: new Date(now + jitter).toISOString() };
}

/** True when a queued row is eligible to (re)try right now. */
export function isRetryReady(row: SyncState, now = Date.now()): boolean {
  if (row.synced || row.dead_letter) return false;
  if (!row.next_attempt_at) return true;
  return new Date(row.next_attempt_at).getTime() <= now;
}

// ── Orders ─────────────────────────────────────────────────────────────────────

export interface OfflineOrderLine {
  catalog_item_id: string;
  sku: string;
  name: string;
  /** Catalog category name — replayed to the server on sync so KDS station routing/reporting
   *  works the same for offline sales as it does online. */
  category?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  /** Per-line tax as charged at the till — replayed to the server on sync. */
  tax_code_id?: string;
  price_includes_tax?: boolean;
  tax_rate?: number;
}

export interface OfflineOrder extends SyncState {
  id?: number; // Dexie auto-increment PK
  local_id: string; // uuid generated client-side — also the server client_reference + Idempotency-Key
  tenant_id: string;
  tenant_slug: string;
  outlet_id: string;
  currency: string;
  subtotal: number;
  tax_total: number;
  total_amount: number;
  lines: OfflineOrderLine[];
  created_at: string; // device-clock time the sale was rung up (becomes offline_created_at server-side)
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

export interface OfflinePayment extends SyncState {
  id?: number;
  // server_order_id: order already exists on server (payment failed while offline)
  server_order_id?: string;
  // local_order_id: order itself was created offline; payment is remapped to the server
  // order id once the order syncs.
  local_order_id?: string;
  tender_id: string;
  tender_method: string;
  amount: number;
  currency: string;
  external_ref?: string;
  tenant_slug: string;
  tenant_id?: string;
  created_at: string;
}

// ── Voids ────────────────────────────────────────────────────────────────────────

export interface OfflineVoid extends SyncState {
  id?: number;
  local_id: string; // idempotency key for the void
  server_order_id?: string; // order already on server
  local_order_id?: string; // order created offline, not yet synced
  line_id?: string; // when set, this is a single line void; otherwise a whole-order void
  reason: string;
  approval_token?: string;
  tenant_id: string;
  tenant_slug: string;
  created_at: string;
}

// ── Returns ──────────────────────────────────────────────────────────────────────

// Mirrors the pos-api returnLineInput so a queued return posts verbatim on sync.
export interface OfflineReturnLine {
  order_line_id?: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  reason?: string;
}

export interface OfflineReturn extends SyncState {
  id?: number;
  local_id: string; // idempotency key for the return
  server_order_id?: string;
  local_order_id?: string;
  outlet_id: string;
  return_type: string; // refund | exchange | store_credit
  reason: string;
  reason_code?: string;
  refund_channel?: string; // cash | mpesa | bank | cheque | store_credit | offset_invoice
  lines: OfflineReturnLine[];
  refund_amount: number; // for local display / dead-letter summary
  tenant_id: string;
  tenant_slug: string;
  created_at: string;
}

// ── Cash Drawer ────────────────────────────────────────────────────────────────

export interface OfflineDrawerSession extends SyncState {
  id?: number;
  local_id: string;
  tenant_id: string;
  tenant_slug: string;
  outlet_id: string;
  starting_cash: number;
  opened_at: string;
  server_drawer_id?: string;
}

export interface OfflineDrawerClose extends SyncState {
  id?: number;
  server_drawer_id?: string; // for drawers already on server
  local_drawer_id?: string; // for drawers opened offline
  ending_cash: number;
  closed_at: string;
  tenant_id: string;
  tenant_slug: string;
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

// ── Cached session/shift/drawer snapshots (cold-start offline) ────────────────────
//
// Last-known-good snapshots of network-owned state so the app shell can render and the
// shift/drawer gate can resolve when the device cold-starts during an outage.
export interface CachedSnapshot {
  key: string; // PK, e.g. `me:${tenantId}`, `shift:${tenantId}`, `drawer:${tenantId}`
  tenant_id: string;
  data: any;
  cached_at: string;
}

// ── Generic key-value dataset cache (IndexedDB-first reads) ──────────────────────
//
// One row per cached dataset (POS settings, tenders, categories, branding, outlet info,
// recent orders …) keyed `${dataset}:${tenantId}[:${outletId}]`. Powers the cache-first
// read helper (src/lib/offline/cache-first.ts) and the 5-min background refresher.
export interface KVCacheRow {
  key: string; // PK
  tenant_id: string;
  data: any;
  cached_at: string;
}

// ── Sync activity log (sync-monitor page) ────────────────────────────────────────
export interface SyncLogEntry {
  id?: number;
  ts: string; // ISO
  direction: 'push' | 'pull';
  entity: string; // e.g. 'order', 'payment', 'catalog', 'pos-settings'
  detail?: string; // human summary, e.g. order number / item count
  status: 'ok' | 'error' | 'skipped';
  error?: string;
  tenant_id?: string;
}

// ── Database ───────────────────────────────────────────────────────────────────

class POSDatabase extends Dexie {
  catalogItems!: Table<OfflineCatalogItem, string>;
  offlineOrders!: Table<OfflineOrder, number>;
  offlinePayments!: Table<OfflinePayment, number>;
  offlineVoids!: Table<OfflineVoid, number>;
  offlineReturns!: Table<OfflineReturn, number>;
  drawerSessions!: Table<OfflineDrawerSession, number>;
  drawerCloses!: Table<OfflineDrawerClose, number>;
  staffProfiles!: Table<CachedStaffProfile, string>;
  etimsQueue!: Table<OfflineETIMSSubmission, number>;
  snapshots!: Table<CachedSnapshot, string>;
  kvCache!: Table<KVCacheRow, string>;
  syncLog!: Table<SyncLogEntry, number>;

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

    // v4: void/return queues + cold-start snapshots. We deliberately DROP `synced` from the
    // indexes — IndexedDB cannot index boolean values, so `where('synced').equals(0)` matched
    // nothing and the queues never drained. Pending rows are now found via `.filter()`.
    this.version(4).stores({
      catalogItems:   'id, tenant_id, sku, category, status, cached_at',
      offlineOrders:  '++id, local_id, tenant_id, created_at',
      offlinePayments:'++id, local_order_id, server_order_id, tenant_id',
      offlineVoids:   '++id, local_id, server_order_id, local_order_id, tenant_id, created_at',
      offlineReturns: '++id, local_id, server_order_id, local_order_id, tenant_id, created_at',
      drawerSessions: '++id, local_id, tenant_id',
      drawerCloses:   '++id, server_drawer_id, local_drawer_id, tenant_id',
      staffProfiles:  'user_id, tenant_id',
      etimsQueue:     '++id, order_id, tenant_id, status, created_at',
      snapshots:      'key, tenant_id',
    });

    // v5: outlet-scoped catalog cache. The pos-api catalog list is filtered per outlet use case
    // (retail vs hospitality menus differ), so cached rows carry outlet_id and reads filter on it.
    this.version(5).stores({
      catalogItems:   'id, tenant_id, outlet_id, sku, category, status, cached_at',
      offlineOrders:  '++id, local_id, tenant_id, created_at',
      offlinePayments:'++id, local_order_id, server_order_id, tenant_id',
      offlineVoids:   '++id, local_id, server_order_id, local_order_id, tenant_id, created_at',
      offlineReturns: '++id, local_id, server_order_id, local_order_id, tenant_id, created_at',
      drawerSessions: '++id, local_id, tenant_id',
      drawerCloses:   '++id, server_drawer_id, local_drawer_id, tenant_id',
      staffProfiles:  'user_id, tenant_id',
      etimsQueue:     '++id, order_id, tenant_id, status, created_at',
      snapshots:      'key, tenant_id',
    });

    // v6: generic dataset cache (kvCache) for IndexedDB-first reads of settings/tenders/
    // categories/branding/etc. + a bounded sync activity log for the sync-monitor page.
    this.version(6).stores({
      catalogItems:   'id, tenant_id, outlet_id, sku, category, status, cached_at',
      offlineOrders:  '++id, local_id, tenant_id, created_at',
      offlinePayments:'++id, local_order_id, server_order_id, tenant_id',
      offlineVoids:   '++id, local_id, server_order_id, local_order_id, tenant_id, created_at',
      offlineReturns: '++id, local_id, server_order_id, local_order_id, tenant_id, created_at',
      drawerSessions: '++id, local_id, tenant_id',
      drawerCloses:   '++id, server_drawer_id, local_drawer_id, tenant_id',
      staffProfiles:  'user_id, tenant_id',
      etimsQueue:     '++id, order_id, tenant_id, status, created_at',
      snapshots:      'key, tenant_id',
      kvCache:        'key, tenant_id, cached_at',
      syncLog:        '++id, ts, direction, entity, status',
    });
  }
}

export const posDB = new POSDatabase();

/** Filter a queue to rows that are ready to (re)try now (unsynced, not dead, past backoff). */
function pendingReady<T extends SyncState>(rows: T[]): T[] {
  const now = Date.now();
  return rows.filter((r) => isRetryReady(r, now));
}

// ── Catalog helpers ────────────────────────────────────────────────────────────

export async function cacheCatalogItems(items: OfflineCatalogItem[]): Promise<void> {
  await posDB.catalogItems.bulkPut(items);
}

/**
 * Read the cached catalog for one tenant + outlet. The catalog is OUTLET-scoped server-side,
 * so rows cached for another outlet (or legacy rows with no outlet_id) are never served — a
 * hospitality menu must not paint on a retail till. With no outletId (outlet unknown yet /
 * legacy callers) it falls back to the tenant-wide set.
 */
export async function getCachedCatalog(tenantId: string, outletId?: string): Promise<OfflineCatalogItem[]> {
  const rows = await posDB.catalogItems.where('tenant_id').equals(tenantId).toArray();
  if (!outletId) return rows;
  return rows.filter((r) => r.outlet_id === outletId);
}

/**
 * REPLACE the cached catalog slice for a tenant+outlet with a fresh full fetch: deletes the
 * outlet's previous rows (and poisoned legacy rows with no outlet_id) before inserting, so
 * items removed/re-scoped server-side actually disappear from the terminal instead of
 * accumulating forever (the old bulkPut-only write built a union of every outlet's menu).
 */
export async function replaceCachedCatalog(
  tenantId: string,
  outletId: string,
  items: OfflineCatalogItem[],
): Promise<void> {
  await posDB.transaction('rw', posDB.catalogItems, async () => {
    await posDB.catalogItems
      .where('tenant_id')
      .equals(tenantId)
      .filter((r) => r.outlet_id === outletId || r.outlet_id == null)
      .delete();
    if (items.length) await posDB.catalogItems.bulkPut(items);
  });
}

// ── Order helpers ──────────────────────────────────────────────────────────────

export async function saveDraftOrder(order: Omit<OfflineOrder, 'id'>): Promise<number> {
  return posDB.offlineOrders.add(order);
}

export async function getPendingSyncOrders(): Promise<OfflineOrder[]> {
  return pendingReady(await posDB.offlineOrders.toArray());
}

/** Lookup an offline order by its client-side local_id (used to detect local-order payments). */
export async function getOfflineOrderByLocalId(localId: string): Promise<OfflineOrder | undefined> {
  return posDB.offlineOrders.where('local_id').equals(localId).first();
}

/** Resolve a synced offline order's server id, if it has one. */
export async function resolveServerOrderId(localId: string): Promise<string | undefined> {
  const o = await getOfflineOrderByLocalId(localId);
  return o?.server_order_id;
}

export async function markOrderSynced(localId: string, serverOrderId: string): Promise<void> {
  await posDB.offlineOrders
    .where('local_id').equals(localId)
    .modify({ synced: true, server_order_id: serverOrderId, sync_error: undefined, dead_letter: false });
}

export async function markOrderSyncFailed(localId: string, error: string, terminal = false): Promise<void> {
  await posDB.offlineOrders.where('local_id').equals(localId).modify((o) => {
    Object.assign(o, nextRetryState(o, error, { terminal }));
  });
}

// ── Payment helpers ────────────────────────────────────────────────────────────

export async function savePendingPayment(payment: Omit<OfflinePayment, 'id'>): Promise<number> {
  return posDB.offlinePayments.add(payment);
}

export async function getPendingSyncPayments(): Promise<OfflinePayment[]> {
  return pendingReady(await posDB.offlinePayments.toArray());
}

export async function markPaymentSynced(id: number): Promise<void> {
  await posDB.offlinePayments.update(id, { synced: true, sync_error: undefined, dead_letter: false });
}

export async function markPaymentSyncFailed(id: number, error: string, terminal = false): Promise<void> {
  const row = await posDB.offlinePayments.get(id);
  if (row) await posDB.offlinePayments.update(id, nextRetryState(row, error, { terminal }));
}

// ── Void helpers ─────────────────────────────────────────────────────────────────

export async function saveDraftVoid(v: Omit<OfflineVoid, 'id'>): Promise<number> {
  return posDB.offlineVoids.add(v);
}

export async function getPendingSyncVoids(): Promise<OfflineVoid[]> {
  return pendingReady(await posDB.offlineVoids.toArray());
}

export async function markVoidSynced(id: number): Promise<void> {
  await posDB.offlineVoids.update(id, { synced: true, sync_error: undefined, dead_letter: false });
}

export async function markVoidSyncFailed(id: number, error: string, terminal = false): Promise<void> {
  const row = await posDB.offlineVoids.get(id);
  if (row) await posDB.offlineVoids.update(id, nextRetryState(row, error, { terminal }));
}

// ── Return helpers ───────────────────────────────────────────────────────────────

export async function saveDraftReturn(r: Omit<OfflineReturn, 'id'>): Promise<number> {
  return posDB.offlineReturns.add(r);
}

export async function getPendingSyncReturns(): Promise<OfflineReturn[]> {
  return pendingReady(await posDB.offlineReturns.toArray());
}

export async function markReturnSynced(id: number): Promise<void> {
  await posDB.offlineReturns.update(id, { synced: true, sync_error: undefined, dead_letter: false });
}

export async function markReturnSyncFailed(id: number, error: string, terminal = false): Promise<void> {
  const row = await posDB.offlineReturns.get(id);
  if (row) await posDB.offlineReturns.update(id, nextRetryState(row, error, { terminal }));
}

// ── Drawer session helpers ─────────────────────────────────────────────────────

export async function saveDraftDrawerSession(session: Omit<OfflineDrawerSession, 'id'>): Promise<number> {
  return posDB.drawerSessions.add(session);
}

export async function getPendingSyncDrawerSessions(): Promise<OfflineDrawerSession[]> {
  return pendingReady(await posDB.drawerSessions.toArray());
}

export async function markDrawerSessionSynced(localId: string, serverDrawerId: string): Promise<void> {
  await posDB.drawerSessions
    .where('local_id').equals(localId)
    .modify({ synced: true, server_drawer_id: serverDrawerId, sync_error: undefined, dead_letter: false });
}

export async function markDrawerSessionSyncFailed(localId: string, error: string, terminal = false): Promise<void> {
  await posDB.drawerSessions.where('local_id').equals(localId).modify((s) => {
    Object.assign(s, nextRetryState(s, error, { terminal }));
  });
}

/** Resolve an offline-opened drawer's server id (reads synced sessions too). */
export async function resolveServerDrawerId(localId: string): Promise<string | undefined> {
  const s = await posDB.drawerSessions.where('local_id').equals(localId).first();
  return s?.server_drawer_id;
}

export async function saveDraftDrawerClose(close: Omit<OfflineDrawerClose, 'id'>): Promise<number> {
  return posDB.drawerCloses.add(close);
}

export async function getPendingSyncDrawerCloses(): Promise<OfflineDrawerClose[]> {
  return pendingReady(await posDB.drawerCloses.toArray());
}

export async function markDrawerCloseSynced(id: number): Promise<void> {
  await posDB.drawerCloses.update(id, { synced: true, sync_error: undefined, dead_letter: false });
}

export async function markDrawerCloseSyncFailed(id: number, error: string, terminal = false): Promise<void> {
  const row = await posDB.drawerCloses.get(id);
  if (row) await posDB.drawerCloses.update(id, nextRetryState(row, error, { terminal }));
}

// ── Aggregate sync status (UI badge + dead-letter review) ────────────────────────

export interface SyncStatusCounts {
  pending: number; // unsynced, not dead-lettered
  deadLetter: number; // terminal failures needing manual review
}

export async function getSyncStatusCounts(): Promise<SyncStatusCounts> {
  const [orders, payments, voids, returns, sessions, closes] = await Promise.all([
    posDB.offlineOrders.toArray(),
    posDB.offlinePayments.toArray(),
    posDB.offlineVoids.toArray(),
    posDB.offlineReturns.toArray(),
    posDB.drawerSessions.toArray(),
    posDB.drawerCloses.toArray(),
  ]);
  const all: SyncState[] = [...orders, ...payments, ...voids, ...returns, ...sessions, ...closes];
  return {
    pending: all.filter((r) => !r.synced && !r.dead_letter).length,
    deadLetter: all.filter((r) => r.dead_letter).length,
  };
}

/** Per-queue pending/dead/synced breakdown for the sync-monitor page. */
export interface QueueBreakdownRow {
  queue: string;
  pending: number;
  deadLetter: number;
  synced: number;
}

export async function getSyncQueueBreakdown(): Promise<QueueBreakdownRow[]> {
  const queues: Array<[string, SyncState[]]> = [
    ['Sales', await posDB.offlineOrders.toArray()],
    ['Payments', await posDB.offlinePayments.toArray()],
    ['Voids', await posDB.offlineVoids.toArray()],
    ['Returns', await posDB.offlineReturns.toArray()],
    ['Drawer opens', await posDB.drawerSessions.toArray()],
    ['Drawer closes', await posDB.drawerCloses.toArray()],
  ];
  return queues.map(([queue, rows]) => ({
    queue,
    pending: rows.filter((r) => !r.synced && !r.dead_letter).length,
    deadLetter: rows.filter((r) => r.dead_letter).length,
    synced: rows.filter((r) => r.synced).length,
  }));
}

export interface DeadLetterItem {
  kind: 'order' | 'payment' | 'void' | 'return' | 'drawer_open' | 'drawer_close';
  id: number | string;
  summary: string;
  error?: string;
  attempts?: number;
  created_at?: string;
}

/** Collect all dead-lettered items across queues for the manual-review surface. */
export async function getDeadLetterItems(): Promise<DeadLetterItem[]> {
  const [orders, payments, voids, returns, sessions, closes] = await Promise.all([
    posDB.offlineOrders.toArray(),
    posDB.offlinePayments.toArray(),
    posDB.offlineVoids.toArray(),
    posDB.offlineReturns.toArray(),
    posDB.drawerSessions.toArray(),
    posDB.drawerCloses.toArray(),
  ]);
  const out: DeadLetterItem[] = [];
  orders.filter((o) => o.dead_letter).forEach((o) =>
    out.push({ kind: 'order', id: o.id!, summary: `Sale ${o.currency} ${o.total_amount.toFixed(2)}`, error: o.sync_error, attempts: o.attempts, created_at: o.created_at }));
  payments.filter((p) => p.dead_letter).forEach((p) =>
    out.push({ kind: 'payment', id: p.id!, summary: `${p.tender_method} ${p.amount.toFixed(2)}`, error: p.sync_error, attempts: p.attempts, created_at: p.created_at }));
  voids.filter((v) => v.dead_letter).forEach((v) =>
    out.push({ kind: 'void', id: v.id!, summary: v.line_id ? 'Line void' : 'Order void', error: v.sync_error, attempts: v.attempts, created_at: v.created_at }));
  returns.filter((r) => r.dead_letter).forEach((r) =>
    out.push({ kind: 'return', id: r.id!, summary: `Return ${r.refund_amount.toFixed(2)}`, error: r.sync_error, attempts: r.attempts, created_at: r.created_at }));
  sessions.filter((s) => s.dead_letter).forEach((s) =>
    out.push({ kind: 'drawer_open', id: s.id!, summary: `Drawer open ${s.starting_cash.toFixed(2)}`, error: s.sync_error, attempts: s.attempts, created_at: s.opened_at }));
  closes.filter((c) => c.dead_letter).forEach((c) =>
    out.push({ kind: 'drawer_close', id: c.id!, summary: `Drawer close ${c.ending_cash.toFixed(2)}`, error: c.sync_error, attempts: c.attempts, created_at: c.closed_at }));
  return out;
}

/** Reset a dead-lettered item so the next drain retries it (manual "retry" action). */
export async function retryDeadLetter(kind: DeadLetterItem['kind'], id: number): Promise<void> {
  const reset = { dead_letter: false, attempts: 0, next_attempt_at: undefined, sync_error: undefined };
  switch (kind) {
    case 'order': await posDB.offlineOrders.update(id, reset); break;
    case 'payment': await posDB.offlinePayments.update(id, reset); break;
    case 'void': await posDB.offlineVoids.update(id, reset); break;
    case 'return': await posDB.offlineReturns.update(id, reset); break;
    case 'drawer_open': await posDB.drawerSessions.update(id, reset); break;
    case 'drawer_close': await posDB.drawerCloses.update(id, reset); break;
  }
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

// ── Snapshot helpers (cold-start) ────────────────────────────────────────────────

export async function cacheSnapshot(key: string, tenantId: string, data: any): Promise<void> {
  await posDB.snapshots.put({ key, tenant_id: tenantId, data, cached_at: new Date().toISOString() });
}

export async function getSnapshot<T = any>(key: string): Promise<T | undefined> {
  const row = await posDB.snapshots.get(key);
  return row?.data as T | undefined;
}

// ── eTIMS queue helpers ────────────────────────────────────────────────────────

export async function queueETIMSSubmission(
  submission: Omit<OfflineETIMSSubmission, 'id'>
): Promise<number> {
  return posDB.etimsQueue.add(submission);
}

export async function getPendingETIMSSubmissions(): Promise<OfflineETIMSSubmission[]> {
  return (await posDB.etimsQueue.toArray()).filter((s) => !s.synced);
}

export async function markETIMSSubmissionSynced(id: number): Promise<void> {
  await posDB.etimsQueue.update(id, { synced: true, status: 'submitted', error: undefined });
}

export async function markETIMSSubmissionFailed(id: number, error: string): Promise<void> {
  await posDB.etimsQueue.update(id, { status: 'failed', error });
}
