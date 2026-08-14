'use client';

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/base';
import { PAYMENT_METHOD_LABELS, getPaymentMethodLabel } from '@bengo-hub/shared-ui-lib';

/** Shared helpers/constants for the All-Sales / POS-Sales surfaces (list, filters, modals).
 *  `currency` defaults to KES for callers that haven't threaded the tenant's real currency
 *  through yet (see usePOSSettings()). */

export const money = (n: number, currency = 'KES') =>
  `${currency} ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Re-exported from shared-ui-lib — was previously a local dict (kept mtn_momo/airtel_money out
// of sync with treasury-ui's own copy until centralized). Provider-name traceability (e.g.
// "Bank Transfer (Equity Bank Uganda)") is available via getPaymentMethodLabel(method, providerName)
// for callers that have a gateway/provider name to show; prettyMethod below stays name-less for the
// simple list-column case.
export { PAYMENT_METHOD_LABELS };

export const prettyMethod = (m: string) => getPaymentMethodLabel(m);

// The Payment Method filter options — the real `payment_data.method` values the POS terminal
// stamps (see terminal-actions.tenderMethodFor + payment-modal), NOT tender rows. The POS reuses one
// generic tender across every method, so tender.type can't drive this list. "Multiple" matches
// split-tender sales the list view labels the same way.
export const PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'mpesa_manual', label: 'M-Pesa (Code)' },
  { value: 'card', label: 'Card' },
  { value: 'card_manual', label: 'Card / PDQ' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'mtn_momo', label: 'MTN Mobile Money' },
  { value: 'airtel_money', label: 'Airtel Money' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cod', label: 'Cash on Delivery' },
  { value: 'on_account', label: 'On Account' },
  { value: 'room_charge', label: 'Room Charge' },
  { value: 'complimentary', label: 'Complimentary' },
];

export const PAYMENT_STATUSES = [
  { value: '', label: 'All' }, { value: 'paid', label: 'Paid' },
  { value: 'due', label: 'Due' }, { value: 'partial', label: 'Partial' },
  { value: 'overdue', label: 'Overdue' }, { value: 'refunded', label: 'Refunded' },
  { value: 'voided', label: 'Voided' }, { value: 'cancelled', label: 'Cancelled' },
];

export const SHIPPING_STATUSES = [
  { value: '', label: 'All' }, { value: 'ordered', label: 'Ordered' }, { value: 'packed', label: 'Packed' },
  { value: 'shipped', label: 'Shipped' }, { value: 'delivered', label: 'Delivered' }, { value: 'cancelled', label: 'Cancelled' },
];

export const SOURCES = [
  { value: '', label: 'All' }, { value: 'pos_terminal', label: 'POS' },
  { value: 'back_office', label: 'Back Office (Add Sale)' },
  { value: 'import', label: 'Imported (migration)' },
];

export function payStatusBadge(s: string) {
  if (s === 'paid') return <Badge variant="success">Paid</Badge>;
  if (s === 'partial') return <Badge variant="warning">Partial</Badge>;
  if (s === 'overdue') return <Badge variant="error">Overdue</Badge>;
  if (s === 'refunded' || s === 'voided' || s === 'cancelled') return <Badge variant="error">{s}</Badge>;
  // "draft" is a not-yet-checked-out cart, not a real sale — showing it as "Due" made an
  // unfinished cart look like an outstanding invoice (the order-000278/boi-enterprises
  // confusion). It falls through to here because it isn't "due"/"partial"/"overdue"; give it its
  // own neutral label instead of the generic due-sale fallback below.
  if (s === 'draft') return <Badge variant="outline">Draft</Badge>;
  return <Badge variant="default">Due</Badge>;
}

export function ModalFrame({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className={`bg-card rounded-2xl border border-border shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[88vh] flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold text-base">{title}</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
