import { posDB, type KVCacheRow, type SyncLogEntry } from '@/lib/db/pos-db';

/**
 * Generic dataset cache + sync activity log helpers (Dexie v6 tables).
 *
 * kvCache holds ONE row per cached dataset (POS settings, tenders, categories, tenant
 * branding, outlet info, recent orders …). Keys are namespaced per tenant (and outlet
 * where the dataset is outlet-scoped): `dataset:tenantId[:outletId]`.
 *
 * syncLog is the bounded activity feed behind the sync-monitor page — every background
 * pull (cache refresh) and push (queued mutation replay) appends an entry.
 */

export function kvKey(dataset: string, tenantId: string, outletId?: string): string {
  return outletId ? `${dataset}:${tenantId}:${outletId}` : `${dataset}:${tenantId}`;
}

export async function setKV(key: string, tenantId: string, data: unknown): Promise<void> {
  await posDB.kvCache.put({ key, tenant_id: tenantId, data, cached_at: new Date().toISOString() });
}

export async function getKV<T = unknown>(key: string): Promise<T | undefined> {
  const row = await posDB.kvCache.get(key);
  return row?.data as T | undefined;
}

/** Full row (incl. cached_at) — the sync-monitor shows per-dataset freshness from this. */
export async function getKVRow(key: string): Promise<KVCacheRow | undefined> {
  return posDB.kvCache.get(key);
}

/** All cached datasets for a tenant (sync-monitor freshness table). */
export async function listKVRows(tenantId: string): Promise<KVCacheRow[]> {
  return posDB.kvCache.where('tenant_id').equals(tenantId).toArray();
}

// ── Sync log ─────────────────────────────────────────────────────────────────────

/** Keep the log bounded so years of POS uptime can't bloat IndexedDB. */
const SYNC_LOG_MAX_ROWS = 500;

export async function appendSyncLog(entry: Omit<SyncLogEntry, 'id' | 'ts'> & { ts?: string }): Promise<void> {
  try {
    await posDB.syncLog.add({ ...entry, ts: entry.ts ?? new Date().toISOString() });
    const count = await posDB.syncLog.count();
    if (count > SYNC_LOG_MAX_ROWS) {
      // Trim oldest rows (auto-increment PK ⇒ ascending id = chronological).
      const excess = count - SYNC_LOG_MAX_ROWS;
      const oldest = await posDB.syncLog.orderBy(':id').limit(excess).primaryKeys();
      await posDB.syncLog.bulkDelete(oldest);
    }
  } catch {
    // Logging must never break the operation being logged.
  }
}

export async function getSyncLog(limit = 200): Promise<SyncLogEntry[]> {
  return posDB.syncLog.orderBy(':id').reverse().limit(limit).toArray();
}

export async function clearSyncLog(): Promise<void> {
  await posDB.syncLog.clear();
}
