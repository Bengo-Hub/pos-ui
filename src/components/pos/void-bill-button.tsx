'use client';

import { useState } from 'react';
import { Ban } from 'lucide-react';
import { toast } from 'sonner';
import { useVoidOrder } from '@/hooks/usePOS';
import { usePermissions, P } from '@/hooks/usePermissions';
import { VoidOrderModal } from '@/components/pos/void-order-modal';
import { VoidApprovalDialog, type VoidApproval } from '@/components/pos/void-approval-dialog';

// Bill states that can still be voided. Paid/closed bills go through Returns/Refunds instead;
// already cancelled/voided bills are terminal. pending_payment is what a bill becomes once the
// kitchen marks every ticket served, and pos-api accepts a void there (voidSkipReason), so a
// served duplicate (urban-loft 003392) must stay voidable here too.
const VOIDABLE_STATUSES = ['open', 'pending', 'pending_payment', 'draft', 'sent', 'in_progress', 'parked', 'unpaid', 'partial'];

interface VoidBillButtonProps {
  orderId: string;
  orderNumber: string;
  status: string;
  onVoided?: () => void;
  className?: string;
  /** Button label — defaults to "Void Bill"; callers embedding this in a different context
   *  (e.g. the All-Sales row menu, which historically said "Void Sale") can override it. */
  label?: string;
}

/**
 * Reusable "Void Bill" control for the Orders list / bill detail / My Bills — the same
 * permission + reason + manager-approval flow the live terminal uses, so a bill can be voided
 * AFTER it was placed (not only while it is open in the terminal). Hidden entirely for users
 * without pos.orders.void and for bills that are no longer voidable.
 */
export function VoidBillButton({ orderId, orderNumber, status, onVoided, className, label = 'Void Bill' }: VoidBillButtonProps) {
  const { can } = usePermissions();
  const voidOrder = useVoidOrder();

  const [reasonOpen, setReasonOpen] = useState(false);
  const [pendingReason, setPendingReason] = useState<string | null>(null);
  const [pendingReasonCode, setPendingReasonCode] = useState<string | undefined>(undefined);

  // Gate on permission AND a voidable status.
  if (!can(P.ORDERS_VOID)) return null;
  if (!VOIDABLE_STATUSES.includes((status || '').toLowerCase())) return null;

  async function finalizeVoid(reason: string, reasonCode?: string, approval?: VoidApproval) {
    try {
      await voidOrder.mutateAsync({ orderId, reason, reasonCode, approvalToken: approval?.approvalToken, voidCode: approval?.voidCode });
      toast.success(`Bill #${orderNumber} voided`);
      onVoided?.();
    } catch {
      toast.error('Could not void this bill. Please check the approval and try again.');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setReasonOpen(true)}
        className={
          className ??
          'flex items-center gap-2 px-4 py-2 rounded-xl border border-destructive/40 text-destructive text-sm font-semibold hover:bg-destructive/5 transition-colors'
        }
      >
        <Ban className="h-4 w-4" />
        {label}
      </button>

      <VoidOrderModal
        open={reasonOpen}
        orderId={orderId}
        orderNumber={orderNumber}
        onClose={() => setReasonOpen(false)}
        onConfirm={async (reason, reasonCode) => {
          if (can(P.ORDERS_VOID_SELF)) {
            await finalizeVoid(reason, reasonCode);
          } else {
            // Cashier / non-manager: require manager approval (scan card, PIN, or a shared code).
            setReasonOpen(false);
            setPendingReason(reason);
            setPendingReasonCode(reasonCode);
          }
        }}
      />

      <VoidApprovalDialog
        open={pendingReason !== null}
        orderNumber={orderNumber}
        onClose={() => setPendingReason(null)}
        onApproved={async (approval) => {
          const reason = pendingReason ?? '';
          const code = pendingReasonCode;
          setPendingReason(null);
          setPendingReasonCode(undefined);
          await finalizeVoid(reason, code, approval);
        }}
      />
    </>
  );
}
