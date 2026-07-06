'use client';

import { useState } from 'react';
import { PackageOpen, Loader2, Ban, HandCoins } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { useHeldItems, useVoidHeldItem, type HeldItem } from '@/hooks/useHeldItems';
import { ClaimHeldItemDialog } from '@/components/pos/claim-held-item-dialog';
import { ManagerPinDialog } from '@/components/pos/manager-pin-dialog';
import { canSelfApproveVoid } from '@/lib/pos/rbac-constants';

/**
 * HeldItemsPanel lists the outlet's set-aside (parked/upsell) items — wrongly-ordered but already
 * made — so a waiter can CLAIM one into any active order (same or another table/waiter) or VOID an
 * unclaimed one at end of shift. Voiding writes off prepared stock, so non-manager roles must get
 * a manager PIN/card approval (action "held_item.void"); managers self-approve.
 * Reused on the My Bills tab, the terminal Parked Items modal, and the shift-close guard prompt.
 */
export function HeldItemsPanel({ compact = false }: { compact?: boolean }) {
  const { data: held = [], isLoading } = useHeldItems('held');
  const voidItem = useVoidHeldItem();
  const roles = useAuthStore((s) => s.user?.roles as string[] | undefined);
  const selfApprove = canSelfApproveVoid(roles);

  const [claiming, setClaiming] = useState<HeldItem | null>(null);
  const [voiding, setVoiding] = useState<HeldItem | null>(null);
  const [pinFor, setPinFor] = useState<HeldItem | null>(null);
  const [voidReason, setVoidReason] = useState('unclaimed at end of day');

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

  const executeVoid = async (h: HeldItem, approvalToken?: string) => {
    try {
      await voidItem.mutateAsync({ id: h.id, reason: voidReason || 'unclaimed', approvalToken });
      toast.success(`Voided ${h.name}`);
      setVoiding(null);
      setPinFor(null);
    } catch (e) {
      const data = (e as { response?: { data?: { error?: string; code?: string } } })?.response?.data;
      // Defensive: server insists on approval (e.g. stale role info) → open the PIN dialog.
      if (data?.code === 'approval_required') {
        setPinFor(h);
        return;
      }
      toast.error(data?.error || 'Could not void item');
    }
  };

  const confirmVoid = (h: HeldItem) => {
    if (selfApprove) void executeVoid(h);
    else setPinFor(h);
  };

  return (
    <div className={compact ? 'rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2' : 'space-y-2'}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
        <PackageOpen className="h-4 w-4" /> Parked items ({held.length})
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
              onClick={() => setClaiming(h)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              <HandCoins className="h-3.5 w-3.5" /> Claim
            </button>
            <button
              onClick={() => setVoiding(h)}
              disabled={voidItem.isPending}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/5 disabled:opacity-50 transition-colors"
            >
              <Ban className="h-3.5 w-3.5" /> Void
            </button>
          </div>
        </div>
      ))}

      {/* Claim → pick the active order (any table/waiter) the item merges into. */}
      <ClaimHeldItemDialog item={claiming} open={claiming !== null} onClose={() => setClaiming(null)} />

      {/* Void confirmation with reason — the write-off "last resort" path. */}
      {voiding && (
        // Panel can sit inside click-to-close modals — keep clicks from bubbling to their backdrops.
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { e.stopPropagation(); setVoiding(null); }}
        >
          <div
            className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-bold flex items-center gap-2">
              <Ban className="h-4 w-4 text-destructive" /> Void parked item
            </h4>
            <p className="text-xs text-muted-foreground">
              {voiding.quantity}× {voiding.name} will be written off.
              {selfApprove ? '' : ' A manager must approve this.'}
            </p>
            <input
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Reason"
              className="w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setVoiding(null)}
                className="flex-1 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-accent/30"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmVoid(voiding)}
                disabled={voidItem.isPending || !voidReason.trim()}
                className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 disabled:opacity-50"
              >
                {voidItem.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : selfApprove ? 'Void item' : 'Get approval…'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ManagerPinDialog
        open={pinFor !== null}
        action="held_item.void"
        label={`void the parked ${pinFor?.name ?? 'item'}`}
        onApproved={(token) => { if (pinFor) void executeVoid(pinFor, token); }}
        onClose={() => setPinFor(null)}
      />
    </div>
  );
}
