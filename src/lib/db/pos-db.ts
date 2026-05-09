import Dexie, { type Table } from 'dexie';

// ── Types ──────────────────────────────────────────────────────────────────────

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
  outlet_id: string;
  currency: string;
  subtotal: number;
  tax_total: number;
  total_amount: number;
  lines: OfflineOrderLine[];
  created_at: string; // ISO string
  synced: boolean;
  sync_error?: string;
  server_order_id?: string; // populated after successful sync
}

export interface OfflinePayment {
  id?: number;
  local_order_id: string; // references OfflineOrder.local_id
  tender_method: string;
  amount: number;
  currency: string;
  created_at: string;
  synced: boolean;
}

// ── Database ───────────────────────────────────────────────────────────────────

class POSDatabase extends Dexie {
  offlineOrders!: Table<OfflineOrder, number>;
  offlinePayments!: Table<OfflinePayment, number>;

  constructor() {
    super('pos_offline_db');

    this.version(1).stores({
      offlineOrders: '++id, local_id, tenant_id, synced, created_at',
      offlinePayments: '++id, local_order_id, synced',
    });
  }
}

export const posDB = new POSDatabase();

// ── Helpers ────────────────────────────────────────────────────────────────────

export async function saveDraftOrder(order: Omit<OfflineOrder, 'id'>): Promise<number> {
  return posDB.offlineOrders.add(order);
}

export async function getPendingSyncOrders(): Promise<OfflineOrder[]> {
  return posDB.offlineOrders.where('synced').equals(0).toArray();
}

export async function markOrderSynced(localId: string, serverOrderId: string): Promise<void> {
  await posDB.offlineOrders
    .where('local_id')
    .equals(localId)
    .modify({ synced: true, server_order_id: serverOrderId });
}

export async function markOrderSyncFailed(localId: string, error: string): Promise<void> {
  await posDB.offlineOrders
    .where('local_id')
    .equals(localId)
    .modify({ sync_error: error });
}
