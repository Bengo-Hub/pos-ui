'use client';

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/base';

/** Shared helpers/constants for the All-Sales / POS-Sales surfaces (list, filters, modals). */

export const money = (n: number) =>
  `KSh ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', card_manual: 'Card / PDQ', pdq: 'Card / PDQ',
  card_terminal: 'Card / PDQ', cheque: 'Cheque', bank_transfer: 'Bank Transfer',
  mpesa: 'M-Pesa', on_account: 'On Account', loyalty: 'Loyalty Points',
};

export const prettyMethod = (m: string) =>
  PAYMENT_METHOD_LABELS[m] ?? (m === 'multiple' ? 'Multiple' : m ? m.replace(/_/g, ' ') : '—');

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
];

export function payStatusBadge(s: string) {
  if (s === 'paid') return <Badge variant="success">Paid</Badge>;
  if (s === 'partial') return <Badge variant="warning">Partial</Badge>;
  if (s === 'overdue') return <Badge variant="error">Overdue</Badge>;
  if (s === 'refunded' || s === 'voided' || s === 'cancelled') return <Badge variant="error">{s}</Badge>;
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
