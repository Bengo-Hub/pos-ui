'use client';

import { useState } from 'react';
import { Ban, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useVoidOrderLine } from '@/hooks/usePOS';
import { usePermissions, P } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth';
import { ApprovalDialog, type ApprovalResult } from '@/components/pos/approval-dialog';
import { VOID_SELF_ROLES } from '@/lib/pos/rbac-constants';

// Line-void reasons lead with the "item became unavailable" case (an ingredient ran out) — the
// scenario partial voiding exists for — then the usual correction reasons.
const LINE_VOID_REASONS = [
  'Out of stock / unavailable',
  'Kitchen unable to prepare',
  'Customer changed mind',
  'Wrong item ordered',
  'Duplicate item',
  'Other',
] as const;

// A line can only be voided while the bill is still open/unsettled. Paid/closed bills go through
// Returns/Refunds instead (so the ledger + KRA eTIMS reverse) — pos-api enforces the same rule.
const VOIDABLE_STATUSES = ['open', 'pending_payment', 'pending', 'draft', 'sent', 'in_progress', 'parked', 'unpaid', 'partial'];

interface VoidLineButtonProps {
  orderId: string;
  orderNumber?: string;
  lineId: string;
  name: string;
  quantity: number;
  status: string;
  /** Set once pos-api has soft-voided the line — hides the control and lets callers strike the row. */
  voidedQty?: number | null;
  /** Fired after a successful void; carries what was voided so list callers can patch local state. */
  onVoided?: (info: { lineId: string; voidedQty: number }) => void;
  /** compact = small inline "Void" text link (list rows); default = bordered button. */
  compact?: boolean;
}

/**
 * Per-line void control — the partial-voiding counterpart to VoidBillButton. Removes a SINGLE item
 * from an open bill (keeping the rest) using the exact same reason + manager-approval flow, so a
 * cashier can drop one unavailable item without voiding the whole order. Approval is required for
 * non-manager roles (scan card / PIN / one-time code), authorizing the `order.line_remove` action.
 */
export function VoidLineButton({
  orderId, orderNumber, lineId, name, quantity, status, voidedQty, onVoided, compact,
}: VoidLineButtonProps) {
  const { can } = usePermissions();
  const role = (useAuthStore((s) => s.user?.roles?.[0]) ?? '') as string;
  const selfApprove = VOID_SELF_ROLES.includes(role);
  const voidLine = useVoidOrderLine();

  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [qty, setQty] = useState(quantity);
  const [pending, setPending] = useState<{ reason: string; qty: number } | null>(null);

  // Hide entirely without the void permission, on non-voidable bills, or for already-voided lines.
  if (!can(P.ORDERS_VOID)) return null;
  if (!VOIDABLE_STATUSES.includes((status || '').toLowerCase())) return null;
  if (voidedQty != null) return null;
  if (!lineId) return null;

  async function finalize(r: string, q: number, approval?: ApprovalResult) {
    try {
      // Only send qty for a genuine partial void; omit it to void the whole line server-side.
      await voidLine.mutateAsync({
        orderId,
        lineId,
        qty: q < quantity ? q : undefined,
        reason: r,
        approvalToken: approval?.approvalToken,
        // A manager's shared one-time code arrives as `code`; pos-api redeems the order.void code.
        voidCode: approval?.code,
      });
      toast.success(q < quantity ? `Voided ${q} × ${name}` : `${name} voided`);
      onVoided?.({ lineId, voidedQty: q });
    } catch {
      toast.error('Could not void this item. Please check the approval and try again.');
    }
  }

  function openReason() {
    setReason('');
    setQty(quantity);
    setReasonOpen(true);
  }

  async function confirmReason() {
    if (!reason) return;
    const q = Math.min(Math.max(1, qty || quantity), quantity);
    if (selfApprove) {
      setReasonOpen(false);
      await finalize(reason, q);
    } else {
      // Cashier / non-manager: hand off to the manager-approval step (scan card, PIN, or code).
      setReasonOpen(false);
      setPending({ reason, qty: q });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openReason}
        title={`Void ${name}`}
        className={
          compact
            ? 'inline-flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50'
            : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/5 transition-colors'
        }
        disabled={voidLine.isPending}
      >
        {voidLine.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
        Void
      </button>

      {/* Reason (+ optional partial quantity) picker */}
      {reasonOpen && (
        <div className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setReasonOpen(false)}>
          <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-base leading-tight">Void item</h2>
                <p className="text-xs text-muted-foreground truncate">{name}{orderNumber ? ` · #${orderNumber}` : ''}</p>
              </div>
            </div>

            {/* Partial quantity — only when more than one of this item is on the bill. */}
            {quantity > 1 && (
              <div className="mb-4">
                <label className="text-xs font-semibold text-muted-foreground">Quantity to void (of {quantity})</label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={quantity}
                    value={qty}
                    onChange={(e) => setQty(Math.min(Math.max(1, Number(e.target.value) || 1), quantity))}
                    className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40"
                  />
                  <span className="text-xs text-muted-foreground">
                    {qty >= quantity ? 'voids the whole line' : `keeps ${quantity - qty} on the bill`}
                  </span>
                </div>
              </div>
            )}

            <p className="text-sm text-muted-foreground mb-3">Select a reason. The rest of the order is untouched.</p>
            <div className="space-y-2 mb-5 max-h-56 overflow-y-auto">
              {LINE_VOID_REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                    reason === r ? 'border-destructive bg-destructive/5 text-destructive' : 'border-border hover:bg-accent'
                  }`}
                >
                  <input type="radio" name="line-void-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-destructive" />
                  <span className="text-sm font-medium">{r}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setReasonOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReason}
                disabled={!reason}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-40"
              >
                {selfApprove ? 'Void item' : 'Get approval…'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manager approval for non-manager roles — authorizes the order.line_remove action. */}
      <ApprovalDialog
        open={pending !== null}
        action="order.line_remove"
        description={`A manager must approve voiding "${name}"${orderNumber ? ` from bill #${orderNumber}` : ''}.`}
        confirmLabel="Authorize void"
        onApproved={async (approval) => {
          const p = pending;
          setPending(null);
          if (p) await finalize(p.reason, p.qty, approval);
        }}
        onClose={() => setPending(null)}
      />
    </>
  );
}
