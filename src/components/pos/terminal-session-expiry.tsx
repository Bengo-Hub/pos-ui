'use client';

/**
 * TerminalSessionExpiryWarning — a persistent, escalating banner that warns a PIN/terminal
 * cashier their session is about to end, and prompts them to re-login BEFORE it does.
 *
 * Why this exists (and why it's warn-and-reauth, not silent-refresh): terminal PIN sessions are
 * issued with NO refresh token and a flat ~4h `expiresAt` (see store/auth.ts setTerminalSession).
 * SSO sessions can silently refresh via refreshAccessToken(); PIN sessions cannot — once the 4h
 * lapses the very next API call 401s with nothing to recover with, which is exactly how a card/PDQ
 * payment failed mid-transaction with a "missing bearer token" error (alpha-china-market, cashier
 * 35 min into shift — the token itself was fine there, but the failure mode is the same class:
 * an expired terminal token surfacing only at the moment of a payment API call, with no warning).
 * A true silent refresh would require the backend to issue refresh tokens to PIN sessions; until
 * then, the safe mitigation is to make the impending expiry LOUD and offer one-tap re-login so the
 * cashier re-authenticates at a natural break instead of discovering it when a sale won't settle.
 *
 * Escalation: hidden until 10 min out → amber advisory (≤10 min) → red, non-dismissable, pulsing
 * (≤2 min). Only ever shown for terminal sessions; SSO sessions refresh transparently and never see it.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AlertTriangle, Clock, LogIn } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

const WARN_AT_MS = 10 * 60 * 1000; // start advising at 10 min remaining
const URGENT_AT_MS = 2 * 60 * 1000; // escalate to red/non-dismissable at 2 min remaining

export function TerminalSessionExpiryWarning() {
  const isTerminalSession = useAuthStore((s) => s.isTerminalSession);
  const status = useAuthStore((s) => s.status);
  const expiresAt = useAuthStore((s) => s.session?.expiresAt);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';

  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState(false);

  // Tick every 15s — precise enough for a minutes countdown without churning renders.
  useEffect(() => {
    if (!isTerminalSession || status !== 'authenticated') return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [isTerminalSession, status]);

  const expiryMs = useMemo(() => (expiresAt ? new Date(expiresAt).getTime() : null), [expiresAt]);
  const remaining = expiryMs != null ? expiryMs - now : null;

  // A fresh re-login resets expiresAt far into the future → clear any prior dismissal.
  useEffect(() => {
    if (remaining != null && remaining > WARN_AT_MS) setDismissed(false);
  }, [remaining]);

  if (!isTerminalSession || status !== 'authenticated' || remaining == null) return null;
  if (remaining > WARN_AT_MS) return null;

  const urgent = remaining <= URGENT_AT_MS;
  // Below-zero shouldn't linger visibly — the next API call will bounce to pin-login anyway.
  const minutes = Math.max(0, Math.floor(remaining / 60_000));
  const seconds = Math.max(0, Math.floor((remaining % 60_000) / 1000));

  if (!urgent && dismissed) return null;

  const reLogin = async () => {
    // End the terminal session cleanly and return to the PIN pad for re-authentication.
    try { await logout(); } catch { /* best-effort */ }
    router.replace(`/${orgSlug}/pin-login`);
  };

  return (
    <div
      className={[
        'flex items-center gap-3 px-4 py-2 border-b text-sm',
        urgent
          ? 'bg-destructive text-destructive-foreground border-destructive animate-pulse'
          : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 border-amber-200 dark:border-amber-800',
      ].join(' ')}
      role="alert"
    >
      {urgent ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Clock className="h-4 w-4 shrink-0" />}
      <span className="font-semibold">
        {urgent
          ? `Session ends in ${minutes}:${String(seconds).padStart(2, '0')} — re-login now so payments don't fail mid-sale.`
          : `Your terminal session ends in about ${minutes} min. Finish the current sale, then re-login.`}
      </span>
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => void reLogin()}
          className={[
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
            urgent ? 'bg-white/90 text-destructive hover:bg-white' : 'bg-amber-600 text-white hover:bg-amber-700',
          ].join(' ')}
        >
          <LogIn className="h-3.5 w-3.5" /> Re-login now
        </button>
        {!urgent && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
