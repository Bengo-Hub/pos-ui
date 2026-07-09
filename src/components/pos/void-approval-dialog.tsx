'use client';

import { ApprovalDialog, type ApprovalResult } from '@/components/pos/approval-dialog';

export interface VoidApproval {
  approvalToken?: string;
  voidCode?: string;
}

interface VoidApprovalDialogProps {
  open: boolean;
  orderNumber?: string;
  onApproved: (approval: VoidApproval) => void;
  onClose: () => void;
}

/**
 * Void-flavored wrapper around the generic ApprovalDialog (scan card / PIN / one-time code) —
 * kept so existing call sites (void-bill-button.tsx) don't need to change shape.
 */
export function VoidApprovalDialog({ open, orderNumber, onApproved, onClose }: VoidApprovalDialogProps) {
  return (
    <ApprovalDialog
      open={open}
      action="order.void"
      description={`A manager must approve to void ${orderNumber ? `bill #${orderNumber}` : 'this bill'}.`}
      confirmLabel="Authorize void"
      onApproved={(a: ApprovalResult) => onApproved({ approvalToken: a.approvalToken, voidCode: a.code })}
      onClose={onClose}
    />
  );
}
