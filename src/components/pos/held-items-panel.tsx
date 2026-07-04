'use client';

import { PackageOpen, Loader2, Ban, HandCoins } from 'lucide-react';
import { toast } from 'sonner';
import { useHeldItems, useClaimHeldItem, useVoidHeldItem, type HeldItem } from '@/hooks/useHeldItems';

/**
 * HeldItemsPanel lists the outlet's set-aside items (wrongly-ordered but already made) so a waiter
 * can CLAIM one for a new customer who wants exactly that item, or VOID an unclaimed one (required
 * before closing a shift). Reused on the My Bills tab and in the shift-close guard prompt.
 */
export function HeldItemsPanel({ compact = false }: { compact?: boolean }) {
  const { data: held = [], isLoading } = useHeldItems('held');
  const claim = useClaimHeldItem();
  const voidItem = useVoidHeldItem();

  if (isLoading) {
    return <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (held.length === 0) {
    return compact ? null : (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
        <PackageOpen className="h-8 w-8 opacity-30" />
        <p className="text-sm">No items set aside.</p>
      </div>
    );
  }

  const doClaim = async (h: HeldItem) => {
    try { await claim.mutateAsync({ id: h.id }); toast.success(`Claimed ${h.name}`); }
    catch { toast.error('Could not claim item'); }
  };
  const doVoid = async (h: HeldItem) => {
    try { await voidItem.mutateAsync({ id: h.id, reason: 'unclaimed' }); toast.success(`Voided ${h.name}`); }
    catch { toast.error('Could not void item'); }
  };

  return (
    <div className={compact ? 'rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2' : 'space-y-2'}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
        <PackageOpen className="h-4 w-4" /> Set-aside items ({held.length})
      </h3>
      {held.map((h) => (
        <div key={h.id} className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{h.quantity}× {h.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              KSh {h.unit_price.toLocaleString()}{h.reason ? ` · ${h.reason}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => doClaim(h)}
              disabled={claim.isPending}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <HandCoins className="h-3.5 w-3.5" /> Claim
            </button>
            <button
              onClick={() => doVoid(h)}
              disabled={voidItem.isPending}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/5 disabled:opacity-50 transition-colors"
            >
              <Ban className="h-3.5 w-3.5" /> Void
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
