'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Banknote, ChevronDown, Eye, Pencil, Trash2, Truck,
  CreditCard, RotateCcw, Link2, Mail, Coins, CalendarClock,
} from 'lucide-react';
import { PrintReceiptButton } from '@/components/pos/print-receipt-button';
import { useNotifySale } from '@/hooks/usePOS';
import { usePermissions, P } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth';

interface SalesActionsMenuProps {
  order: any;
  orgSlug: string;
  onView: (order: any) => void;
  onEditShipping: (order: any) => void;
  onViewPayments: (order: any) => void;
  onEditLines: (order: any) => void;
  onMoveDate: (order: any) => void;
  onDelete: (order: any) => void;
  /** Settle an on-account (credit) sale — shown only while money is still owed. */
  onRecordPayment?: (order: any) => void;
}

// Tenant admin/owner tier — deliberately narrower than P.ORDERS_MANAGE (which a plain
// manager also holds). Mirrors pos-api's dateMoveAdminRoles (orders_date_move.go): moving a
// sale's reporting date is scoped to admins/platform owners only, one notch above the
// manager-level authority ORDERS_MANAGE grants for line-price edits/voids. This is UX only —
// the backend enforces the real boundary.
const DATE_MOVE_ADMIN_ROLES = new Set(['admin', 'owner', 'pos_admin', 'super_admin', 'superuser']);

/**
 * SalesActionsMenu — the GoDigital "Actions" dropdown for an All-Sales / POS-only row. Each item
 * routes to the correct integrated flow:
 *  - View / Edit Shipping / View Payments / Edit Line Prices / Delete → open modals (delegated to the parent)
 *  - Edit → the back-office Add Sale editor
 *  - Print Invoice / Packing Slip / Delivery Note → the receipt/print pipeline (PrintReceiptButton)
 *  - Sell Return → the returns flow (pos-api → treasury refund + credit note + inventory restock)
 *  - Invoice URL → copy a shareable link to the sale
 *  - New Sale Notification → pos-api /notify → notifications-service (customer SMS receipt)
 */
export function SalesActionsMenu({ order, orgSlug, onView, onEditShipping, onViewPayments, onEditLines, onMoveDate, onDelete, onRecordPayment }: SalesActionsMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const notify = useNotifySale();
  const authUser = useAuthStore((s) => s.user);

  // Permission gating — items the user cannot act on are HIDDEN (not disabled). The
  // backend enforces the same permissions, so this is UX, not the security boundary.
  const { can, canAny } = usePermissions();
  const canView = canAny([P.ORDERS_VIEW, P.ORDERS_VIEW_OWN]);
  const canChange = canAny([P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE]);
  const canDelete = canAny([P.ORDERS_VOID, P.ORDERS_MANAGE]);
  const canViewPayments = canAny([P.PAYMENTS_VIEW, P.PAYMENTS_VIEW_OWN, P.PAYMENTS_MANAGE]);
  const canTakePayment = canAny([P.PAYMENTS_ADD, P.PAYMENTS_MANAGE]);
  const canReturn = canChange; // return initiation mirrors the backend change_own/change/manage gate
  const canNotify = can(P.ORDERS_MANAGE);
  const canEditLines = can(P.ORDERS_MANAGE);
  const canMoveDate =
    authUser?.isPlatformOwner === true ||
    authUser?.isSuperUser === true ||
    (authUser?.roles ?? []).some((r) => DATE_MOVE_ADMIN_ROLES.has(String(r).toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const isDelivery = order.order_subtype === 'delivery' || order.order_type === 'delivery';
  const isFinal = order.status === 'completed';
  const linesLocked = ['completed', 'cancelled', 'voided', 'refunded'].includes(order.status);

  const close = () => setOpen(false);
  const item = 'flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left hover:bg-accent transition-colors';

  const copyInvoiceUrl = async () => {
    const url = `${window.location.origin}/${orgSlug}/orders/${order.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Invoice link copied');
    } catch {
      toast.error('Could not copy link');
    }
    close();
  };

  const sendNotification = () => {
    notify.mutate(
      { orderId: order.id },
      {
        onSuccess: () => toast.success('Sale notification queued'),
        onError: (e: any) => toast.error(e?.response?.data?.error || 'Could not send notification'),
      },
    );
    close();
  };

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 h-8 px-3 rounded-md border border-primary/40 text-primary text-xs font-bold hover:bg-primary/5"
      >
        Actions <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-xl border border-border bg-card shadow-xl py-1.5">
          {canView && <button className={item} onClick={() => { onView(order); close(); }}><Eye className="h-4 w-4 text-muted-foreground" /> View</button>}
          {canChange && <button className={item} onClick={() => { router.push(`/${orgSlug}/sell/add?order_id=${order.id}`); close(); }}><Pencil className="h-4 w-4 text-muted-foreground" /> Edit</button>}
          {canDelete && <button className={item} onClick={() => { onDelete(order); close(); }}><Trash2 className="h-4 w-4 text-destructive" /> Delete</button>}
          {canChange && <button className={item} onClick={() => { onEditShipping(order); close(); }}><Truck className="h-4 w-4 text-muted-foreground" /> Edit Shipping</button>}

          {/* Print pipeline — the receipt document reused for invoice / packing slip / delivery note. */}
          {canView && (
            <div className="px-1">
              <PrintReceiptButton orderId={order.id} label="Print Invoice" variant="ghost" className="w-full !justify-start gap-2.5 !px-2 h-9 text-sm font-normal" />
              <PrintReceiptButton orderId={order.id} label="Packing Slip" variant="ghost" className="w-full !justify-start gap-2.5 !px-2 h-9 text-sm font-normal" />
              {isDelivery && (
                <PrintReceiptButton orderId={order.id} label="Delivery Note" variant="ghost" className="w-full !justify-start gap-2.5 !px-2 h-9 text-sm font-normal" />
              )}
            </div>
          )}

          <div className="my-1 border-t border-border" />

          {canViewPayments && <button className={item} onClick={() => { onViewPayments(order); close(); }}><CreditCard className="h-4 w-4 text-muted-foreground" /> View Payments</button>}
          {/* Settle an on-account (credit) sale — money still owed on it. */}
          {onRecordPayment && canTakePayment &&
            ['due', 'partial', 'overdue'].includes(order.payment_status) && (order.amount_due ?? 0) > 0.01 && (
            <button className={item} onClick={() => { onRecordPayment(order); close(); }}>
              <Banknote className="h-4 w-4 text-emerald-600" /> Record Payment
            </button>
          )}
          {canEditLines && !linesLocked && <button className={item} onClick={() => { onEditLines(order); close(); }}><Coins className="h-4 w-4 text-muted-foreground" /> Edit Line Prices</button>}
          {canMoveDate && <button className={item} onClick={() => { onMoveDate(order); close(); }}><CalendarClock className="h-4 w-4 text-muted-foreground" /> Move Sale Date</button>}
          {isFinal && canReturn && (
            <button className={item} onClick={() => { router.push(`/${orgSlug}/returns?invoice=${encodeURIComponent(order.order_number)}`); close(); }}>
              <RotateCcw className="h-4 w-4 text-muted-foreground" /> Sell Return
            </button>
          )}
          {canView && <button className={item} onClick={copyInvoiceUrl}><Link2 className="h-4 w-4 text-muted-foreground" /> Invoice URL</button>}
          {canNotify && <button className={item} onClick={sendNotification}><Mail className="h-4 w-4 text-muted-foreground" /> New Sale Notification</button>}
        </div>
      )}
    </div>
  );
}
