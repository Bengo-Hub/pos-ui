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
 * the sale total. A 20s countdown runs while nothing has matched; cashier can cancel any time. As
 * soon as exactly one match lands, the search stops and the customer's payment details (payer
 * name/phone, M-Pesa receipt, amount, time) are shown for a one-tap confirm — claiming (and,
 * server-side, settling) only happens on that explicit confirm, not silently on match. The rare
 * multi-match case (two customers paying the identical amount) falls back to a pick-one list.
 *
 * On timeout (no match in 20s), the panel does NOT auto-close — Daraja's C2B confirmation webhook
 * can legitimately be slower than 20s, or never land for a payment that genuinely happened. Instead
 * it offers Retry (restart the search) alongside "Enter M-Pesa Code", which falls back to the
 * cashier keying in the SMS confirmation code directly (settled via the same `mpesa_manual` tender
 * the standalone "M-Pesa Code" entry uses) — so a sale is never stuck just because the automatic
 * match didn't land in time.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, X, CheckCircle2, User, Phone, Receipt, Clock, Hash, RotateCcw, FlaskConical } from 'lucide-react';
import { useListC2BPayments, useClaimC2BPayment, useSimulateC2BPayment, type C2BPayment } from '@/hooks/usePOS';
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
  /** Settles the sale from a manually-entered M-Pesa SMS code (the timeout fallback) — the caller
   *  implements this via its own existing mpesa_manual tender path (createIntent). Receives the
   *  trimmed, uppercased code the cashier typed. */
  onManualCodeConfirm: (code: string) => void;
  /** True while the caller's onManualCodeConfirm is in flight, so this panel can show a spinner. */
  manualConfirming?: boolean;
  /** Shows a "Simulate C2B" trigger (sandbox-only testing aid) — callers gate this to the demo
   *  tenant (useSubscription().isDemo); treasury-api independently hard-blocks it in production. */
  showSimulateButton?: boolean;
  /** Compact heading — inline bar uses a tight strip, the settle modal has more room. */
  compact?: boolean;
}

type Phase = 'searching' | 'timedOut' | 'manualEntry';

export function C2BPaymentMatcher({
  amount, currency, orderId, tenderId, isOnline, onCancel, onClaimed,
  onManualCodeConfirm, manualConfirming = false, showSimulateButton = false, compact = false,
}: C2BPaymentMatcherProps) {
  const c2bQuery = useListC2BPayments(amount, isOnline);
  const claimC2B = useClaimC2BPayment();
  const simulateC2B = useSimulateC2BPayment();
  const candidates = c2bQuery.data?.candidates ?? [];

  const [phase, setPhase] = useState<Phase>('searching');
  const [searchGeneration, setSearchGeneration] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(SEARCH_TIMEOUT_MS / 1000));
  const [manualCode, setManualCode] = useState('');
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;

  // 20s search window: only while nothing has matched yet and we're actively searching. A match
  // found mid-countdown stops the clock (no point timing out a search that already succeeded).
  useEffect(() => {
    if (phase !== 'searching' || candidates.length > 0) return;
    const start = Date.now();
    const tick = setInterval(() => {
      const remainingMs = SEARCH_TIMEOUT_MS - (Date.now() - start);
      if (remainingMs <= 0) {
        clearInterval(tick);
        if (candidatesRef.current.length === 0) {
          setPhase('timedOut');
        }
        return;
      }
      setSecondsLeft(Math.ceil(remainingMs / 1000));
    }, 250);
    return () => clearInterval(tick);
    // Restart the window on the target amount changing OR an explicit Retry (searchGeneration).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, searchGeneration, phase]);

  const handleRetry = () => {
    setSecondsLeft(Math.ceil(SEARCH_TIMEOUT_MS / 1000));
    setSearchGeneration((g) => g + 1);
    setPhase('searching');
  };

  const handleSimulate = () => {
    simulateC2B.mutate(
      { amount, billRefNumber: orderId },
      {
        onSuccess: () => toast.success('C2B payment simulated — Safaricom will confirm shortly.'),
        onError: async (e: any) => toast.error(await apiErrorMessage(e, 'Could not simulate the C2B payment.')),
      },
    );
  };

  const handleManualSubmit = () => {
    const code = manualCode.trim().toUpperCase();
    if (!code) return;
    onManualCodeConfirm(code);
  };

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
        <MpesaLogo className="h-5 w-9 rounded shrink-0" /> C2B · {formatCurrency(amount, currency)}
      </span>
      <button onClick={onCancel} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent" aria-label="Cancel">
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  const simulateButton = showSimulateButton ? (
    <button
      type="button"
      onClick={handleSimulate}
      disabled={simulateC2B.isPending}
      className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-lg hover:bg-amber-500/15 transition-colors disabled:opacity-50"
      title="Sandbox testing only — simulates Safaricom sending a real C2B confirmation for this amount"
    >
      {simulateC2B.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
      Simulate C2B (demo)
    </button>
  ) : null;

  const wrapClass = compact
    ? 'p-3 border-b border-border bg-green-500/5 space-y-2'
    : 'p-5 space-y-4';

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

  // ── Manual M-Pesa code entry (timeout fallback) ───────────────────────────────────────────────
  if (phase === 'manualEntry') {
    return (
      <div className={wrapClass}>
        {header}
        <p className="text-xs text-muted-foreground">
          Enter the M-Pesa confirmation code from the customer&apos;s SMS to close this sale.
        </p>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">M-Pesa Code</span>
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2">
            <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              autoFocus
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter' && !manualConfirming) handleManualSubmit(); }}
              placeholder="e.g. QB234ABCDE"
              className="flex-1 bg-transparent text-sm font-bold tracking-widest uppercase outline-none"
              maxLength={20}
            />
          </div>
        </label>
        <button
          type="button"
          disabled={!manualCode.trim() || manualConfirming}
          onClick={handleManualSubmit}
          className="w-full min-h-11 rounded-xl bg-green-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-green-700 transition-colors"
        >
          {manualConfirming ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          Confirm &amp; Complete Sale
        </button>
        <button onClick={() => setPhase('timedOut')} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back
        </button>
      </div>
    );
  }

  // ── Timed out: no match after 20s — offer Retry or the manual-code fallback, never a dead end ─
  if (phase === 'timedOut') {
    return (
      <div className={wrapClass}>
        {header}
        <div className="rounded-xl bg-muted/40 px-4 py-4 text-center text-sm text-muted-foreground">
          No matching M-Pesa payment found within 20s. If the customer already paid, Daraja&apos;s
          confirmation may just be running slow — try again, or enter the SMS code directly.
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleRetry}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border font-semibold text-sm hover:bg-accent transition-colors"
          >
            <RotateCcw className="h-4 w-4" /> Retry
          </button>
          <button
            type="button"
            onClick={() => setPhase('manualEntry')}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-700 transition-colors"
          >
            <Hash className="h-4 w-4" /> Enter M-Pesa Code
          </button>
        </div>
        {simulateButton}
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
        <p className="text-xs text-muted-foreground">{secondsLeft}s left in this search</p>
      </div>
      <button
        type="button"
        onClick={() => setPhase('manualEntry')}
        className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <Hash className="h-3.5 w-3.5" /> Already have the M-Pesa code? Enter it instead
      </button>
      {simulateButton}
      <button onClick={onCancel} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        Cancel
      </button>
    </div>
  );
}
