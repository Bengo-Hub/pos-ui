'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useMenuItems, toOfflineCatalogRows, type CatalogItem,
} from '@/hooks/usePOS';
import { getCachedCatalog, cacheCatalogItems, type OfflineCatalogItem } from '@/lib/db/pos-db';
import { appendSyncLog } from '@/lib/db/kv-cache';

/** Debounce a fast-changing value (search input) so we don't refetch on every keystroke. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

type ReconcileStatus = 'in-sync' | 'mismatched' | 'not-cached';

interface ReconcileRow {
  item: CatalogItem;
  cached?: OfflineCatalogItem;
  status: ReconcileStatus;
}

/**
 * Sync Monitor tab: search menu items and compare the freshly-fetched inventory price, the
 * POS-DB resolved price (pos-api's override-merged `price`), and this device's cached price
 * side by side — then reconcile the device's IndexedDB cache to the server-resolved price for
 * items that drifted (e.g. a price changed in inventory but the terminal hasn't refreshed yet).
 *
 * "Sync" here only refreshes the DEVICE CACHE to the already-authoritative server price — it
 * does not write a POS price override (SetCatalogItemPrice/BulkSetCatalogPrices own that).
 */
export function PriceReconcileTab({ tenantID, outletID }: { tenantID: string; outletID: string }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [cachedBySku, setCachedBySku] = useState<Map<string, OfflineCatalogItem>>(new Map());
  const [syncingSku, setSyncingSku] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const { data, isLoading, isFetching, refetch } = useMenuItems({ search: debouncedSearch, limit: 100 });

  const loadCached = async () => {
    if (!tenantID) return;
    const rows = await getCachedCatalog(tenantID, outletID || undefined);
    setCachedBySku(new Map(rows.map((r) => [r.sku, r])));
  };

  useEffect(() => { void loadCached(); }, [tenantID, outletID]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows: ReconcileRow[] = useMemo(() => {
    const items = data?.data ?? [];
    return items.map((item) => {
      const cached = item.sku ? cachedBySku.get(item.sku) : undefined;
      let status: ReconcileStatus = 'not-cached';
      if (cached) {
        status = cached.unit_price === (item.price ?? 0) ? 'in-sync' : 'mismatched';
      }
      return { item, cached, status };
    });
  }, [data, cachedBySku]);

  const mismatchedRows = rows.filter((r) => r.status !== 'in-sync');

  async function syncRow(row: ReconcileRow) {
    if (!tenantID) return;
    setSyncingSku(row.item.sku);
    try {
      await cacheCatalogItems(toOfflineCatalogRows(tenantID, outletID, [row.item]));
      await appendSyncLog({
        direction: 'pull',
        entity: 'catalog',
        status: 'ok',
        tenant_id: tenantID,
        detail: `Reconciled price for ${row.item.sku} (${row.item.name})`,
      });
      await loadCached();
    } finally {
      setSyncingSku(null);
    }
  }

  async function syncAllMismatched() {
    if (!tenantID || mismatchedRows.length === 0) return;
    setSyncingAll(true);
    try {
      await cacheCatalogItems(
        toOfflineCatalogRows(tenantID, outletID, mismatchedRows.map((r) => r.item)),
      );
      await appendSyncLog({
        direction: 'pull',
        entity: 'catalog',
        status: 'ok',
        tenant_id: tenantID,
        detail: `Reconciled ${mismatchedRows.length} item price(s)`,
      });
      await loadCached();
    } finally {
      setSyncingAll(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu items by name or SKU…"
            className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button
          onClick={() => { void refetch(); void loadCached(); }}
          className="flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm font-semibold hover:bg-accent"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} /> Refresh
        </button>
        {mismatchedRows.length > 0 && (
          <button
            onClick={() => void syncAllMismatched()}
            disabled={syncingAll}
            className="flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            <RefreshCw className={cn('h-4 w-4', syncingAll && 'animate-spin')} />
            Sync all mismatched ({mismatchedRows.length})
          </button>
        )}
      </div>

      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <h2 className="px-4 py-3 border-b border-border text-sm font-bold">
          Menu item prices — inventory vs. POS DB vs. device cache
        </h2>
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {debouncedSearch ? 'No menu items match that search.' : 'Search for a menu item to compare its prices.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2 text-right">Inventory price</th>
                  <th className="px-4 py-2 text-right">POS DB price</th>
                  <th className="px-4 py-2 text-right">Device cache price</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.item.id} className="border-t border-border/60">
                    <td className="px-4 py-2">
                      <p className="font-medium">{row.item.name}</p>
                      <p className="text-xs text-muted-foreground">{row.item.sku}</p>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.item.inventory_price != null ? row.item.inventory_price.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.item.price != null ? row.item.price.toFixed(2) : '—'}
                    </td>
                    <td className={cn('px-4 py-2 text-right tabular-nums', row.status === 'mismatched' && 'font-bold text-amber-600')}>
                      {row.cached ? row.cached.unit_price.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {row.status === 'in-sync' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> In sync
                        </span>
                      )}
                      {row.status === 'mismatched' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-600">
                          <TriangleAlert className="h-3 w-3" /> Mismatched
                        </span>
                      )}
                      {row.status === 'not-cached' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          Not cached
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {row.status !== 'in-sync' && (
                        <button
                          onClick={() => void syncRow(row)}
                          disabled={syncingSku === row.item.sku}
                          className="flex items-center gap-1 ml-auto text-xs font-semibold text-primary hover:underline disabled:opacity-60"
                        >
                          <RefreshCw className={cn('h-3 w-3', syncingSku === row.item.sku && 'animate-spin')} /> Sync
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
