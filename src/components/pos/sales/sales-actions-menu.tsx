'use client';

import { PrintReceiptButton } from '@/components/pos/print-receipt-button';
import { VoidBillButton } from '@/components/pos/void-bill-button';
import { canPutOnAccount } from '@/hooks/use-close-on-account';
import { P, usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth';
import {
    Banknote,
    CalendarClock,
    ChevronDown,
    Coins,
    CreditCard,
    Eye,
    Link2,
    NotebookPen,
    Pencil,
    RotateCcw,
    Trash2, Truck
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ReceiptShareButtons } from './receipt-share-actions';

interface SalesActionsMenuProps {
  order: any;
  orgSlug: string;
  onView: (order: any) => void;
  onEditShipping: (order: any) => void;
  onViewPayments: (order: any) => void;
  onEditLines: (order: any) => void;
  onMoveDate: (order: any) => void;
  /** Permanently delete a FINALIZED sale via the admin Delete-Sale ("shred") tool — fiscalised
   *  sales are reversed+soft-marked, non-fiscalised sales are genuinely hard-deleted. */
  onDeleteSale?: (order: any) => void;
  /** Edit a FINALIZED sale's lines/qty/price in place — opens the in-place editor directly;
   *  nothing is reversed until Save, and only for whatever was actually removed/reduced. */
  onEditFinalizedSale?: (order: any) => void;
  /** Settle an on-account (credit) sale — shown only while money is still owed. */
  onRecordPayment?: (order: any) => void;
  /** Book a still-owing, NOT-yet-on-account sale's balance to treasury AR (put on account). */
  onPutOnAccount?: (order: any) => void;
  /** Correct served-by/customer on a COMPLETED sale — line items/totals stay locked. */
  onEditSaleInfo?: (order: any) => void;
  /** Warms this order's ['pos-order', tenantId, id] cache before the menu is even opened, so
   *  whichever edit path the user picks (resume-into-terminal or in-place Edit Sale — both load
   *  via `useOrder`) can paint from cache instead of a cold fetch. Fired on hover/focus of the
   *  Actions trigger, not on row render, so it never fans out across an entire visible page. */
  onPrefetchEdit?: (order: any) => void;
}

// Tenant admin/owner tier — deliberately narrower than P.ORDERS_MANAGE (which a plain
// manager also holds). Mirrors pos-api's dateMoveAdminRoles (orders_date_move.go): moving a
// sale's reporting date is scoped to admins/platform owners only, one notch above the
// manager-level authority ORDERS_MANAGE grants for line-price edits/voids. This is UX only —
// the backend enforces the real boundary.
const DATE_MOVE_ADMIN_ROLES = new Set(['admin', 'owner', 'pos_admin', 'super_admin', 'superuser']);

export function SalesActionsMenu({ order, orgSlug, onView, onEditShipping, onViewPayments, onEditLines, onMoveDate, onDeleteSale, onEditFinalizedSale, onRecordPayment, onPutOnAccount, onEditSaleInfo, onPrefetchEdit }: SalesActionsMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const authUser = useAuthStore((s) => s.user);

  // Permission gating — items the user cannot act on are HIDDEN (not disabled). The
  // backend enforces the same permissions, so this is UX, not the security boundary.
  const { can, canAny } = usePermissions();
  const canView = canAny([P.ORDERS_VIEW, P.ORDERS_VIEW_OWN]);
  const canChange = canAny([P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE]);
  // Permanent delete of a FINALIZED sale — a distinct, stronger tier than the void/soft-delete
  // above (admin by default; tenant-configurable via the Roles & Permissions matrix).
  const canDeleteSale = can(P.ORDERS_DELETE);
  // Full line/qty/price edit of a FINALIZED sale (reverse + recreate) — admin by default.
  const canEditFinalizedSale = can(P.ORDERS_EDIT_FINALIZED);
  const canViewPayments = canAny([P.PAYMENTS_VIEW, P.PAYMENTS_VIEW_OWN, P.PAYMENTS_MANAGE]);
  const canTakePayment = canAny([P.PAYMENTS_ADD, P.PAYMENTS_MANAGE]);
  const canReturn = canChange; // return initiation mirrors the backend change_own/change/manage gate
  // Share via WhatsApp / Send Notification: pos-api's /notify and /receipt/share-link routes
  // carry NO permission middleware (any authenticated outlet user can already call them) — the
  // pos.orders.manage gate here was frontend-only over-restriction with nothing backing it
  // server-side. Visible to anyone who can view the sale at all (same tier as Print/Invoice URL).
  const canNotify = canView;
  const canEditLines = can(P.ORDERS_MANAGE);
  // Correcting served-by/customer on an already-completed sale is the same authority tier as
  // editing line prices (backend PATCH /orders/{id}/sale-info requires pos.orders.manage too).
  const canEditSaleInfo = can(P.ORDERS_MANAGE);
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

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => onPrefetchEdit?.(order)}
        onFocus={() => onPrefetchEdit?.(order)}
        className="flex items-center gap-1 h-8 px-3 rounded-md border border-primary/40 text-primary text-xs font-bold hover:bg-primary/5"
      >
        Actions <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-xl border border-border bg-card shadow-xl py-1.5">
          {canView && <button className={item} onClick={() => { onView(order); close(); }}><Eye className="h-4 w-4 text-muted-foreground" /> View</button>}
          {/* Resuming into the terminal only works for a still-open draft/order — a completed
              sale's lines/totals are locked (eTIMS-signed, GL-posted), so route it to the
              sale-info corrector instead of a resume that pos-api will reject outright. */}
          {canChange && !linesLocked && (
            <button className={item} onClick={() => { router.push(`/${orgSlug}/sell/add?order_id=${order.id}`); close(); }}>
              <Pencil className="h-4 w-4 text-muted-foreground" /> Edit
            </button>
          )}
          {/* The real full-CRUD editor for a finalized sale (add/remove/swap lines, qty, price —
              adjusts the sale in place). Listed first among the finalized-sale actions so it
              isn't missed in favor of the narrower "Edit Sale Info" below (they used to share
              the same "Edit" label, which is exactly why admins kept landing on the wrong one). */}
          {isFinal && canEditFinalizedSale && onEditFinalizedSale && (
            <button className={item} onClick={() => { onEditFinalizedSale(order); close(); }}>
              <Pencil className="h-4 w-4 text-primary" /> Edit Sale
            </button>
          )}
          {isFinal && canEditSaleInfo && onEditSaleInfo && (
            <button className={item} onClick={() => { onEditSaleInfo(order); close(); }}>
              <Pencil className="h-4 w-4 text-muted-foreground" /> Edit Sale Info
            </button>
          )}
          {/* VoidBillButton is self-contained (permission gate, voidable-status gate, reason
              dialog, manager-approval collection) — the same component used on the bill detail
              page / My Bills, so this row can never drift out of sync with the real void flow
              the way the old plain "onDelete" callback silently did. */}
          <VoidBillButton
            orderId={order.id}
            orderNumber={order.order_number}
            status={order.status}
            label="Void Sale"
            className={`${item} text-destructive`}
            onVoided={close}
          />
          {/* Delete Sale ("shred") refuses ANY sale that already has a return, refund, or
              reversal on record — a deliberate, unchanged policy distinct from Edit Sale's
              (which allows repeat corrections). Disabling here — instead of only learning
              this after confirming a dialog that promises unconditional deletion — is the fix
              for a live report where an admin couldn't tell why Delete kept failing on sales
              they'd already corrected via Edit Sale/a return. */}
          {isFinal && canDeleteSale && onDeleteSale && (
            order.has_correction_history ? (
              <button
                className={`${item} opacity-50 cursor-not-allowed`}
                disabled
                title="This sale already has a return, refund, or reversal on record — Delete Sale is disabled. Use the Edit Sale or Sell Return tool instead."
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" /> Delete Sale
              </button>
            ) : (
              <button className={item} onClick={() => { onDeleteSale(order); close(); }}>
                <Trash2 className="h-4 w-4 text-destructive" /> Delete Sale
              </button>
            )
          )}
          {canChange && <button className={item} onClick={() => { onEditShipping(order); close(); }}><Truck className="h-4 w-4 text-muted-foreground" /> Edit Shipping</button>}

          {/* Print pipeline — the receipt document reused for invoice / packing slip / delivery note. */}
          {canView && (
            <div className="px-1">
              <PrintReceiptButton orderId={order.id} label="Print Invoice" variant="ghost" className="w-full justify-start! gap-2.5 px-2! h-9 text-sm font-normal" />
              <PrintReceiptButton orderId={order.id} label="Packing Slip" variant="ghost" className="w-full justify-start! gap-2.5 px-2! h-9 text-sm font-normal" />
              {isDelivery && (
                <PrintReceiptButton orderId={order.id} label="Delivery Note" variant="ghost" className="w-full justify-start! gap-2.5 px-2! h-9 text-sm font-normal" />
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
          {/* Put a still-owing, not-yet-on-account sale's balance on account (treasury AR debtor). */}
          {onPutOnAccount && canTakePayment && canPutOnAccount(order) && (
            <button className={item} onClick={() => { onPutOnAccount(order); close(); }}>
              <NotebookPen className="h-4 w-4 text-orange-600" /> Put Balance on Account
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
          {canNotify && (
            <div className="px-2 py-2">
              <ReceiptShareButtons
                order={order}
                className="flex flex-col gap-2"
                compact
                buttonClassName="w-full justify-start gap-2.5 px-2 h-9 text-sm font-normal"
              />
            </div>
          )}
        </div>
      )}

    </div>
  );
}
