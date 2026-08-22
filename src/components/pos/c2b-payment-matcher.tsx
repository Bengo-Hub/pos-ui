'use client';

/**
 * M-Pesa C2B payment matcher — the SINGLE shared implementation of "customer paid the till
 * directly" reconciliation, used by both the inline terminal action bar
 * (terminal/inline-payment-bar.tsx) and the modal-style settle flow (payment-modal.tsx, and via it
 * split-payment-modal.tsx). Previously each surface hand-rolled its own copy of this query+claim
 * flow (drifted labels, no timeout/cancel, silent one-click claim) — centralized here so a future
 * change (copy, timeout, matching behavior) only has one place to land.
 *
 * Clicking the M-Pesa C2B tender mounts this component, which immediately starts actively querying
 * treasury's C2B inbox (already-polling `useListC2BPayments`, amount-scoped) for a payment matching
 * the sale total. A 20s countdown auto-cancels the search if nothing turns up (no dead-end spinner);
 * cashier can cancel any time. As soon as exactly one match lands, the search stops and the
 * customer's payment details (payer name/phone, M-Pesa receipt, amount, time) are shown for a
 * one-tap confirm — claiming (and, server-side, settling) only happens on that explicit confirm, not
 * silently on match. The rare multi-match case (two customers paying the identical amount) falls
 * back to a pick-one list, same as before.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X, CheckCircle2, User, Phone, Receipt, Clock } from 'lucide-react';
import { useListC2BPayments, useClaimC2BPayment, type C2BPayment } from '@/hooks/usePOS';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { MpesaLogo } from '@/components/pos/mpesa-logo';
import { formatTransTime } from '@/lib/pos/c2b-format';

const SEARCH_TIMEOUT_MS = 20_000;

export interface C2BPaymentMatcherProps {
  amount: number;
  currency: string;
  orderId: string;
  tenderId: string;
  isOnline: boolean;
  onCancel: () => void;
  onClaimed: () => void;
  /** Compact heading — inline bar uses a tight strip, the settle modal has more room. */
  compact?: boolean;
}

export function C2BPaymentMatcher({
  amount, currency, orderId, tenderId, isOnline, onCancel, onClaimed, compact = false,
}: C2BPaymentMatcherProps) {
  const c2bQuery = useListC2BPayments(amount, isOnline);
  const claimC2B = useClaimC2BPayment();
  const candidates = c2bQuery.data?.candidates ?? [];

  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(SEARCH_TIMEOUT_MS / 1000));
  const [timedOut, setTimedOut] = useState(false);
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // 20s auto-close: only while nothing has matched yet. A match found mid-countdown stops the
  // clock (no point auto-cancelling a search that already succeeded).
  useEffect(() => {
    if (candidates.length > 0) return;
    const start = Date.now();
    const tick = setInterval(() => {
      const remainingMs = SEARCH_TIMEOUT_MS - (Date.now() - start);
      if (remainingMs <= 0) {
        clearInterval(tick);
        if (candidatesRef.current.length === 0) {
          setTimedOut(true);
          toast.info('No matching M-Pesa payment found within 20s.');
          onCancelRef.current();
        }
        return;
      }
      setSecondsLeft(Math.ceil(remainingMs / 1000));
    }, 250);
    return () => clearInterval(tick);
    // Restart the window only when the search target amount changes, not on every candidates poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  const single: C2BPayment | null = candidates.length === 1 ? candidates[0] : null;

  const handleConfirm = (c: C2BPayment) => {
    claimC2B.mutate(
      { transID: c.trans_id, posOrderId: orderId, amount, tenderId },
      {
        onSuccess: onClaimed,
        onError: async (e: any) => toast.error(await apiErrorMessage(e, 'Could not confirm that payment. It may have just been claimed by another till.')),
      },
    );
  };

  const header = (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm font-bold">
        <MpesaLogo className="h-5 w-5 rounded shrink-0" /> C2B · {formatCurrency(amount, currency)}
      </span>
      <button onClick={onCancel} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent" aria-label="Cancel">
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  const wrapClass = compact
    ? 'p-3 border-b border-border bg-green-500/5 space-y-2'
    : 'p-5 space-y-4';

  if (timedOut) return null; // onCancel already fired — parent unmounts this panel.

  // ── Exactly one match: show customer + payment details, require an explicit confirm ──────────
  if (single) {
    const displayAmount = typeof single.amount === 'string' ? parseFloat(single.amount) : single.amount;
    const when = formatTransTime(single.trans_time);
    return (
      <div className={wrapClass}>
        {header}
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="text-sm font-bold">Matching payment found</span>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-semibold">{single.payer_name || 'M-Pesa payer'}</span>
            </div>
            {single.msisdn && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-mono">{single.msisdn}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Receipt className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-mono">{single.trans_id}</span>
            </div>
            {when && (
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>{when}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-green-500/20 pt-3">
            <span className="text-xs text-muted-foreground font-medium">Amount received</span>
            <span className="font-bold text-base tabular-nums text-green-700 dark:text-green-400">
              {formatCurrency(displayAmount, currency)}
            </span>
          </div>
        </div>
        <button
          type="button"
          disabled={claimC2B.isPending}
          onClick={() => handleConfirm(single)}
          className="w-full min-h-11 rounded-xl bg-green-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-green-700 transition-colors"
        >
          {claimC2B.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          Confirm &amp; Complete Sale
        </button>
        <button onClick={onCancel} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          Not this payment — Cancel
        </button>
      </div>
    );
  }

  // ── Multiple matches (rare — same amount, different customers): pick one ─────────────────────
  if (candidates.length > 1) {
    return (
      <div className={wrapClass}>
        {header}
        <p className="text-xs text-muted-foreground">
          {candidates.length} payments of {formatCurrency(amount, currency)} are waiting — pick the customer&apos;s.
        </p>
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {candidates.map((c) => (
            <button
              key={c.trans_id}
              type="button"
              disabled={claimC2B.isPending}
              onClick={() => handleConfirm(c)}
              className="w-full flex items-center justify-between gap-3 rounded-lg border border-border hover:border-green-500/50 px-3 py-2 text-left disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold truncate">{c.payer_name || c.msisdn || 'M-Pesa payer'}</span>
                <span className="block text-[10px] text-muted-foreground truncate">{c.trans_id}</span>
              </span>
              <span className="text-sm font-bold tabular-nums shrink-0">
                {formatCurrency(typeof c.amount === 'string' ? parseFloat(c.amount) : c.amount, currency)}
              </span>
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
      </div>
    );
  }

  // ── Still searching ────────────────────────────────────────────────────────────────────────
  return (
    <div className={wrapClass}>
      {header}
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-green-600" />
        <p className="text-sm text-muted-foreground">
          Checking for the customer&apos;s M-Pesa payment of {formatCurrency(amount, currency)}…
        </p>
        <p className="text-xs text-muted-foreground">Auto-cancelling in {secondsLeft}s if none is found</p>
      </div>
      <button onClick={onCancel} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        Cancel
      </button>
    </div>
  );
}
