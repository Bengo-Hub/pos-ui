'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, HandCoins, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CreditSaleDetails {
  /** YYYY-MM-DD — sent as paymentDueDate; the sale reads "overdue" after this date. */
  dueDate: string;
  /** Optional free-text terms/notes stamped on the order (metadata.credit_notes). */
  notes: string;
}

export const DEFAULT_CREDIT_PERIOD_DAYS = 30;

function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Reusable credit-sale (on-account) details capture — shared by the payment modal, the
 * terminal inline payment bar, and back-office Add Sale, so every credit sale carries the
 * same extras: a due date (defaults to +30 days; the sale is "due" until then and
 * "overdue" after) and optional notes/terms. Customer + amount are decided by the caller.
 */
export function CreditSaleDetailsModal({
  open,
  customerName,
  amountLabel,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  customerName?: string | null;
  /** Preformatted amount (e.g. "KSh 2,400.00") shown in the header strip. */
  amountLabel?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (details: CreditSaleDetails) => void;
}) {
  const [dueDate, setDueDate] = useState(() => plusDays(DEFAULT_CREDIT_PERIOD_DAYS));
  const [notes, setNotes] = useState('');

  // Fresh defaults each time it opens (a new credit sale, not the previous one's terms).
  useEffect(() => {
    if (open) {
      setDueDate(plusDays(DEFAULT_CREDIT_PERIOD_DAYS));
      setNotes('');
    }
  }, [open]);

  if (!open) return null;

  const today = new Date().toISOString().slice(0, 10);
  const dateValid = !!dueDate && dueDate >= today;

  const quickPick = (days: number) => setDueDate(plusDays(days));
  const activeQuick = (days: number) => dueDate === plusDays(days);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onCancel}>
      <div
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="credit-sale-details-modal"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-primary" />
            <h2 className="font-bold text-base">Credit sale details</h2>
          </div>
          <button onClick={onCancel} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {(customerName || amountLabel) && (
            <div className="rounded-xl bg-accent/40 border border-border px-3.5 py-2.5 text-sm">
              {customerName && <p className="font-semibold">{customerName}</p>}
              {amountLabel && <p className="text-muted-foreground">On account: <span className="font-bold text-foreground">{amountLabel}</span></p>}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" /> Payment due date
            </label>
            <input
              type="date"
              value={dueDate}
              min={today}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50"
              data-testid="credit-due-date"
            />
            <div className="flex gap-1.5 pt-0.5">
              {[7, 14, 30, 60].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => quickPick(d)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold border transition',
                    activeQuick(d)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {d} days
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              The sale shows as <span className="font-semibold">Due</span> until this date and{' '}
              <span className="font-semibold text-destructive">Overdue</span> after it.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Notes / terms (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="e.g. Pay by end month; agreed with owner"
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ dueDate, notes: notes.trim() })}
            disabled={!dateValid || loading}
            className="flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="credit-confirm"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Charge to account
          </button>
        </div>
      </div>
    </div>
  );
}
