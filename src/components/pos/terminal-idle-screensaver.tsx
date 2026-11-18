'use client';

/**
 * TerminalIdleScreensaver: idle sign-out for an active terminal (PIN) session.
 *
 * When a PIN-authenticated staff member leaves the terminal idle past the timeout, a "Still
 * there?" dialog counts down (idle_countdown_seconds, default 30). Any activity or "Keep me
 * logged in" cancels it; at zero the session signs out to the PIN pad, where the branded
 * screensaver runs. No-op for SSO sessions and on the PIN route.
 *
 * Timeout (resolveIdleTimeoutMs): device override, then the user's role value from
 * idle_timeout_by_role, then screensaver_timeout_seconds, then 5 minutes. On /kds the kitchen
 * value applies when longer. 0 means never.
 */

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Clock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useIdleTimer, resolveIdleTimeoutMs, type IdleTimeoutSettings } from '@/hooks/use-idle-timer';
import { useAuthStore } from '@/store/auth';
import { usePOSSettings } from '@/hooks/usePOSSettings';

const DEFAULT_COUNTDOWN_S = 30;

export function TerminalIdleScreensaver() {
  const pathname = usePathname();
  const isTerminalSession = useAuthStore((s) => s.isTerminalSession);
  const hasSession = useAuthStore((s) => !!s.session);
  const roles = useAuthStore((s) => s.user?.roles);
  const logout = useAuthStore((s) => s.logout);
  const { data: posSettings } = usePOSSettings();
  const settings = posSettings as IdleTimeoutSettings | undefined;

  // Only arm for an active PIN/terminal session, and never on the PIN page (it runs its own).
  const armed = hasSession && isTerminalSession && !pathname?.includes('/pin-login');
  const isKdsRoute = /\/kds(\/|$)/.test(pathname ?? '');
  const timeoutMs = armed ? resolveIdleTimeoutMs(settings, roles, isKdsRoute) : 0;
  const cfgCountdown = settings?.idle_countdown_seconds;
  const countdownS = typeof cfgCountdown === 'number' && cfgCountdown >= 5
    ? Math.min(cfgCountdown, 300)
    : DEFAULT_COUNTDOWN_S;

  // Epoch ms when the countdown ends; null while not counting down.
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const handleIdle = useCallback(() => {
    if (!armed) return;
    setNow(Date.now());
    setDeadline(Date.now() + countdownS * 1000);
  }, [armed, countdownS]);

  // Any activity during the countdown keeps the session. Terminal sessions have no renew
  // endpoint (see terminal-session-expiry.tsx), so keeping only resets the idle timer.
  const keep = useCallback(() => setDeadline(null), []);
  const handleActive = useCallback(() => {
    setDeadline((d) => (d === null ? d : null));
  }, []);

  useIdleTimer(handleIdle, handleActive, timeoutMs);

  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);

  const remainingS = deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));

  useEffect(() => {
    if (deadline === null || now < deadline) return;
    setDeadline(null);
    // Auth store redirects a POS logout to /{orgSlug}/pin-login.
    void logout();
  }, [deadline, now, logout]);

  // Session ended elsewhere: drop any countdown.
  useEffect(() => { if (!armed) setDeadline(null); }, [armed]);

  if (!armed || deadline === null) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) keep(); }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Still there?
          </DialogTitle>
          <DialogDescription>
            You&apos;ll be signed out in <span className="font-bold tabular-nums">{remainingS}</span> s.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setDeadline(null); void logout(); }}>Sign out</Button>
          <Button onClick={keep}>Keep me logged in</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
