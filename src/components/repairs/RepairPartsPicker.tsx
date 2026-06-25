'use client';

import { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { useMenuItems, type CatalogItem } from '@/hooks/usePOS';
import { useAddRepairPart } from '@/hooks/useRepairs';
import { apiErrorMessage } from '@/lib/api/error-message';

interface RepairPartsPickerProps {
  jobID: string;
  disabled?: boolean;
}

/**
 * Catalog-backed parts picker for a repair job. Reuses the shared `useMenuItems`
 * hook (the same catalog search the POS terminal uses) — does NOT re-implement
 * item search. Selecting an item adds it as a part line via the repairs API.
 */
export function RepairPartsPicker({ jobID, disabled }: RepairPartsPickerProps) {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useMenuItems({ search: search || undefined, limit: 20 });
  const addPart = useAddRepairPart();

  const items = data?.data ?? [];

  function handleAdd(item: CatalogItem) {
    addPart.mutate(
      {
        jobID,
        input: {
          inventory_sku: item.sku,
          inventory_item_id: item.id,
          description: item.name,
          quantity: 1,
          unit_cost: String(item.price ?? 0),
        },
      },
      {
        onSuccess: () => {
          import('sonner').then(({ toast }) => toast.success(`Added ${item.name}`));
          setSearch('');
        },
        onError: async (e) => {
          const { toast } = await import('sonner');
          toast.error(await apiErrorMessage(e, 'Failed to add part'));
        },
      },
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          disabled={disabled}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search catalog for parts…"
          className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
        />
      </div>

      {search.length >= 2 && (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
          {isLoading ? (
            <div className="p-3 text-sm text-muted-foreground">Searching…</div>
          ) : items.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No items found</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={disabled || addPart.isPending}
                onClick={() => handleAdd(item)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent transition-colors disabled:opacity-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.sku}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">
                  {new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(
                    item.price ?? 0,
                  )}
                </span>
                <Plus className="h-4 w-4 text-primary shrink-0" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
