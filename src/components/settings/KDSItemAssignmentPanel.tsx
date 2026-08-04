'use client';

import { useState } from 'react';
import { Loader2, Search, Utensils, X } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui/base';
import { useMenuItems } from '@/hooks/usePOS';
import { useAllKDSStations, useSetCatalogItemKDSStation } from '@/hooks/useKDS';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { inputClass, labelClass } from './shared';

// KDSItemAssignmentPanel lets a manager pin a specific menu item to a station, overriding both
// the category_filter routing AND the hot-beverage-forces-kitchen guard (resolveStationForLine
// priority 1, pos-api/internal/modules/orders/service.go) — e.g. a coffee-family drink the
// tenant actually wants prepared/served at the Bar rather than the Kitchen default. Search finds
// the item by name/SKU; assigning writes POSCatalogOverride.kds_station_id via
// PATCH /pos/catalog/items/kds-station. Clearing (station = "— Use category routing —") reverts
// the item to normal category/hot-beverage-guard routing.
export function KDSItemAssignmentPanel() {
  const { can } = usePermissions();
  const canEdit = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE);
  const outlet = useAuthStore((s) => s.outlet);

  const [query, setQuery] = useState('');
  const [selectedStationByItem, setSelectedStationByItem] = useState<Record<string, string>>({});

  const { data: stationsData, isLoading: stationsLoading } = useAllKDSStations();
  const stations = (stationsData?.data ?? []).filter((s) => s.is_active);

  const { data: itemsData, isFetching: itemsLoading } = useMenuItems({
    search: query,
    limit: 20,
    enabled: query.trim().length >= 2,
  });
  const items = itemsData?.data ?? [];

  const assign = useSetCatalogItemKDSStation();

  const handleAssign = async (sku: string) => {
    const stationID = selectedStationByItem[sku] ?? '';
    try {
      await assign.mutateAsync({ sku, station_id: stationID || undefined, outlet_id: outlet?.id });
      toast.success(stationID ? 'Item routed to station' : 'Station override cleared — back to category routing');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to update station assignment'));
    }
  };

  if (!canEdit) return null;

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center gap-2">
          <Utensils className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Assign Items to a Station</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Pin a specific item to a station — this wins over category filters AND the automatic
          hot-beverage-to-kitchen routing. Use it for exceptions (e.g. a coffee drink your bar
          actually prepares, or a dessert made at the bar station).
        </p>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search item by name or SKU…"
            className={`${inputClass} pl-9`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {itemsLoading && query.trim().length >= 2 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
          </div>
        )}

        {query.trim().length >= 2 && !itemsLoading && items.length === 0 && (
          <p className="text-xs text-muted-foreground">No items match &ldquo;{query}&rdquo;.</p>
        )}

        <div className="space-y-2">
          {items.map((item) => {
            const selected = selectedStationByItem[item.sku] ?? '';
            return (
              <div key={item.sku} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{item.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {item.sku}
                    {item.category ? ` · ${item.category}` : ''}
                  </p>
                </div>
                <select
                  value={selected}
                  onChange={(e) =>
                    setSelectedStationByItem((m) => ({ ...m, [item.sku]: e.target.value }))
                  }
                  disabled={stationsLoading}
                  className={`${inputClass} w-48`}
                >
                  <option value="">— Use category routing —</option>
                  {stations.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={() => handleAssign(item.sku)}
                  disabled={assign.isPending}
                >
                  {assign.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  Save
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
