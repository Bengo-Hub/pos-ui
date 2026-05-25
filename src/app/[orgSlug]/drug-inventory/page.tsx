'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, FlaskConical, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DrugItem {
  id: string;
  name: string;
  sku?: string;
  stock_on_hand?: number;
  reorder_level?: number;
  batch_number?: string;
  lot_number?: string;
  expiry_date?: string;
  unit?: string;
  category?: string;
}

function daysUntilExpiry(dateStr?: string): number | null {
  if (!dateStr) return null;
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function expiryBadge(days: number | null) {
  if (days === null) return null;
  if (days < 0)   return <span className="text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 px-1.5 py-0.5 rounded-full">Expired</span>;
  if (days <= 30) return <span className="text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded-full">Exp. {days}d</span>;
  return <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">Exp. {new Date(new Date().setDate(new Date().getDate() + days)).toLocaleDateString()}</span>;
}

function stockBadge(item: DrugItem) {
  const qty = item.stock_on_hand ?? 0;
  const reorder = item.reorder_level ?? 0;
  if (qty <= 0)       return <span className="text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 px-1.5 py-0.5 rounded-full">Out of stock</span>;
  if (qty <= reorder) return <span className="text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded-full">Low stock</span>;
  return <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">In stock</span>;
}

function useDrugInventory(filter: string) {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  return useQuery({
    queryKey: ['drug-inventory', tenantID, filter],
    queryFn: () => apiClient.get<{ data: DrugItem[] }>(`/api/v1/${tenantID}/pos/catalog/items?category=medication${filter === 'low_stock' ? '&low_stock=true' : filter === 'expiring' ? '&expiring_days=30' : ''}`),
    enabled: !!tenantID,
    staleTime: 2 * 60_000,
  });
}

function DrugInventoryPage() {
  const [filter, setFilter] = useState<'all' | 'low_stock' | 'expiring'>('all');
  const { data, isLoading } = useDrugInventory(filter);
  const items = data?.data ?? [];

  const filters: { key: 'all' | 'low_stock' | 'expiring'; label: string }[] = [
    { key: 'all', label: 'All Drugs' },
    { key: 'low_stock', label: 'Low Stock' },
    { key: 'expiring', label: 'Expiring Soon (30d)' },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <FlaskConical className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Drug Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track stock levels, expiry dates, and batch information</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
              filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading inventory…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <FlaskConical className="h-10 w-10 opacity-30" />
          <p className="font-medium">No drugs found for this filter</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Drug Name</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Batch / Lot</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Expiry</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Qty on Hand</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Reorder At</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => {
                const days = daysUntilExpiry(item.expiry_date);
                const isExpiredOrLow = days !== null && days <= 30 || (item.stock_on_hand ?? 0) <= (item.reorder_level ?? 0);
                return (
                  <tr key={item.id} className={cn('hover:bg-accent/20 transition-colors', isExpiredOrLow && 'bg-amber-500/3')}>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        {isExpiredOrLow && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground text-xs">
                      {item.batch_number && <span>B: {item.batch_number}</span>}
                      {item.batch_number && item.lot_number && <br />}
                      {item.lot_number && <span>L: {item.lot_number}</span>}
                      {!item.batch_number && !item.lot_number && '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1">
                        {item.expiry_date && (
                          <span className="text-xs text-muted-foreground">{new Date(item.expiry_date).toLocaleDateString()}</span>
                        )}
                        {expiryBadge(days)}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center font-semibold">
                      {item.stock_on_hand ?? '—'} {item.unit ?? ''}
                    </td>
                    <td className="px-4 py-3.5 text-center text-muted-foreground">
                      {item.reorder_level ?? '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      {stockBadge(item)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function DrugInventoryPageGated() {
  return (
    <ModuleGate moduleKey="drug_inventory" fallback={<ModuleUnavailablePage moduleKey="drug_inventory" />}>
      <DrugInventoryPage />
    </ModuleGate>
  );
}
