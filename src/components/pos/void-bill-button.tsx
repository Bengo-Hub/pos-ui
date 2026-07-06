'use client';

import { useState } from 'react';
import { Ban } from 'lucide-react';
import { toast } from 'sonner';
import { useVoidOrder } from '@/hooks/usePOS';
import { usePermissions, P } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth';
import { VoidOrderModal } from '@/components/pos/void-order-modal';
import { VoidApprovalDialog, type VoidApproval } from '@/components/pos/void-approval-dialog';
import { VOID_SELF_ROLES } from '@/lib/pos/rbac-constants';

// Bill states that can still be voided. Paid/closed bills go through Returns/Refunds instead;
// already cancelled/voided bills are terminal.
const VOIDABLE_STATUSES = ['open', 'pending', 'draft', 'sent', 'in_progress', 'parked', 'unpaid', 'partial'];

interface VoidBillButtonProps {
  orderId: string;
  orderNumber: string;
  status: string;
  onVoided?: () => void;
  className?: string;
}

/**
 * Reusable "Void Bill" control for the Orders list / bill detail / My Bills — the same
 * permission + reason + manager-approval flow the live terminal uses, so a bill can be voided
 * AFTER it was placed (not only while it is open in the terminal). Hidden entirely for users
 * without pos.orders.void and for bills that are no longer voidable.
 */
export function VoidBillButton({ orderId, orderNumber, status, onVoided, className }: VoidBillButtonProps) {
  const { can } = usePermissions();
  const role = (useAuthStore((s) => s.user?.roles?.[0]) ?? '') as string;
  const voidOrder = useVoidOrder();

  const [reasonOpen, setReasonOpen] = useState(false);
  const [pendingReason, setPendingReason] = useState<string | null>(null);

  // Gate on permission AND a voidable status.
  if (!can(P.ORDERS_VOID)) return null;
  if (!VOIDABLE_STATUSES.includes((status || '').toLowerCase())) return null;

  async function finalizeVoid(reason: string, approval?: VoidApproval) {
    try {
      await voidOrder.mutateAsync({ orderId, reason, approvalToken: approval?.approvalToken, voidCode: approval?.voidCode });
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
        Void Bill
      </button>

      <VoidOrderModal
        open={reasonOpen}
        orderId={orderId}
        orderNumber={orderNumber}
        onClose={() => setReasonOpen(false)}
        onConfirm={async (reason) => {
          if (VOID_SELF_ROLES.includes(role)) {
            await finalizeVoid(reason);
          } else {
            // Cashier / non-manager: require manager approval (scan card, PIN, or a shared code).
            setReasonOpen(false);
            setPendingReason(reason);
          }
        }}
      />

      <VoidApprovalDialog
        open={pendingReason !== null}
        orderNumber={orderNumber}
        onClose={() => setPendingReason(null)}
        onApproved={async (approval) => {
          const reason = pendingReason ?? '';
          setPendingReason(null);
          await finalizeVoid(reason, approval);
        }}
      />
    </>
  );
}
