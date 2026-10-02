'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

// Restock tracking written by pos-api into the return's metadata when inventory-api reports
// back on inventory.return.restocked (see pos-api internal/modules/returns/restock.go).
interface RestockLine {
  sku: string;
  quantity: number;
  // location is the outlet (branch) the goods went back to, resolved by pos-api; a shared/HQ
  // warehouse with no outlet uses its own name. warehouse_name is kept for older outcomes.
  location?: string;
  outlet_name?: string;
  warehouse_name?: string;
  method?: 'reversal' | 'direct';
}

type RestockStatus =
  | 'restocked'
  | 'already_restocked'
  | 'nothing_to_restock'
  | 'skipped_not_entitled'
  | 'not_restocked'
  | 'pending'
  | 'failed';

const STATUS_VIEW: Record<RestockStatus | 'unconfirmed', { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  restocked:            { label: 'Back in stock',              tone: 'bg-emerald-500/10 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  already_restocked:    { label: 'Back in stock',              tone: 'bg-emerald-500/10 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  nothing_to_restock:   { label: 'No stock to return',         tone: 'bg-muted text-muted-foreground border-border',          icon: CheckCircle2 },
  skipped_not_entitled: { label: 'Not restocked (no inventory sync on plan)', tone: 'bg-muted text-muted-foreground border-border', icon: AlertTriangle },
  not_restocked:        { label: 'Written off (not restocked)', tone: 'bg-muted text-muted-foreground border-border',          icon: AlertTriangle },
  pending:              { label: 'Restock in progress',        tone: 'bg-amber-500/10 text-amber-700 border-amber-200',       icon: Clock },
  failed:               { label: 'Restock failed',             tone: 'bg-red-500/10 text-red-600 border-red-200',             icon: AlertTriangle },
  unconfirmed:          { label: 'Restock not confirmed',      tone: 'bg-amber-500/10 text-amber-700 border-amber-200',       icon: AlertTriangle },
};

const lineLocation = (l: RestockLine) => l.location || l.outlet_name || l.warehouse_name || '';

const SETTLED = new Set<string>(['restocked', 'already_restocked', 'nothing_to_restock', 'skipped_not_entitled', 'not_restocked']);

// returnLineLocations maps a returned SKU to the location(s), meaning outlet/branch, it went back to, from
// metadata.restock_lines. A recipe item restocks its ingredients rather than its own SKU, so a
// SKU with no direct match (or no SKU, as in the Returns list) falls back to every location the
// return went to. Until inventory confirms, the label reflects the restock status instead.
// Shared by the Returns list "Returned To" column and the return detail's Returned Items table.
export function returnLineLocations(metadata?: Record<string, any>): (sku?: string) => string {
  const status: string | undefined = metadata?.restock_status;
  const lines: RestockLine[] = Array.isArray(metadata?.restock_lines) ? metadata!.restock_lines : [];
  const all: string[] = Array.isArray(metadata?.restock_locations) ? metadata!.restock_locations : [];
  const skipped = new Set<string>(Array.isArray(metadata?.restock_skipped) ? metadata!.restock_skipped : []);
  const bySku = new Map<string, Set<string>>();
  for (const l of lines) {
    const loc = lineLocation(l);
    if (!loc) continue;
    if (!bySku.has(l.sku)) bySku.set(l.sku, new Set());
    bySku.get(l.sku)!.add(loc);
  }
  return (sku?: string) => {
    if (sku && bySku.has(sku)) return Array.from(bySku.get(sku)!).join(', ');
    if (sku && skipped.has(sku)) return 'Not a stock item';
    if (all.length > 0) return all.join(', ');
    if (status === 'pending') return 'Restock in progress';
    if (status === 'failed') return 'Restock failed';
    if (status === 'nothing_to_restock') return 'Not a stock item';
    if (status === 'skipped_not_entitled') return 'Not restocked';
    if (status === 'not_restocked') return 'Written off (not restocked)';
    return 'Not confirmed';
  };
}

export function RestockStatusCard({
  returnId,
  metadata,
  canRetry,
}: {
  returnId: string;
  metadata?: Record<string, any>;
  canRetry: boolean;
}) {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const qc = useQueryClient();
  const status = (metadata?.restock_status as RestockStatus | undefined) ?? 'unconfirmed';
  const view = STATUS_VIEW[status] ?? STATUS_VIEW.unconfirmed;
  const Icon = view.icon;
  const lines: RestockLine[] = Array.isArray(metadata?.restock_lines) ? metadata!.restock_lines : [];
  const locations: string[] = Array.isArray(metadata?.restock_locations) ? metadata!.restock_locations : [];
  const skipped: string[] = Array.isArray(metadata?.restock_skipped) ? metadata!.restock_skipped : [];
  const updatedAt: string | undefined = metadata?.restock_updated_at;

  const retry = useMutation({
    mutationFn: () =>
      apiClient.post(`/api/v1/${tenantID}/pos/returns/restock/resync`, { return_ids: [returnId], dry_run: false }),
    onSuccess: () => {
      toast.success('Restock requested. Inventory will confirm shortly.');
      qc.invalidateQueries({ queryKey: ['return', tenantID, returnId] });
    },
    onError: async (err) => toast.error(await apiErrorMessage(err, 'Could not request restock')),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <p className="text-sm font-bold">Stock</p>
        </div>
        <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border', view.tone)}>
          <Icon className="h-3.5 w-3.5" />
          {view.label}
        </span>
      </div>

      {locations.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground">Returned to</p>
          <p className="text-sm font-semibold mt-0.5">{locations.join(', ')}</p>
        </div>
      )}

      {lines.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-accent/30 border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">SKU</th>
                <th className="px-3 py-2 text-right font-semibold">Qty back</th>
                <th className="px-3 py-2 text-left font-semibold">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l, i) => (
                <tr key={`${l.sku}-${lineLocation(l)}-${i}`}>
                  <td className="px-3 py-2 font-mono text-xs">{l.sku}</td>
                  <td className="px-3 py-2 text-right">{l.quantity}</td>
                  <td className="px-3 py-2">{lineLocation(l) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {skipped.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Not stock items, nothing to put back: <span className="font-mono">{skipped.join(', ')}</span>
        </p>
      )}
      {status === 'failed' && metadata?.restock_error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{metadata.restock_error}</p>
      )}
      {status === 'unconfirmed' && (
        <p className="text-xs text-muted-foreground">
          This return was completed before stock confirmation existed. Use Restock now if the items are not yet back in stock.
        </p>
      )}
      {updatedAt && <p className="text-[11px] text-muted-foreground">Updated {new Date(updatedAt).toLocaleString()}</p>}

      {canRetry && !SETTLED.has(status) && (
        <button
          type="button"
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-accent transition-colors disabled:opacity-50"
        >
          {retry.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Restock now
        </button>
      )}
    </div>
  );
}
