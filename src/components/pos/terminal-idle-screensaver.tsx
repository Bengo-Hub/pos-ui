'use client';

/**
 * TerminalIdleScreensaver — reusable branded idle lock for an ACTIVE terminal (PIN) session.
 *
 * When a PIN-authenticated staff member leaves the terminal idle past the configured timeout we
 * show the full-screen tenant-branded screensaver (logo + live clock). The FIRST interaction wakes
 * it and immediately signs the staff member out back to the PIN pad, so the next staff member must
 * re-enter their PIN before transacting (terminal hand-off security).
 *
 * This complements the screensaver already shown on the PIN page itself (which only needs to wake,
 * since there is no session to drop there). Mount once at the app shell — it no-ops for SSO sessions
 * (managers/owners) and on the kiosk PIN route, and only arms for `isTerminalSession`.
 *
 * Timeout precedence (resolveScreensaverTimeoutMs): device-local override → service_config / outlet
 * setting → 5-minute default.
 */

import { useCallback, useState } from 'react';
import { usePathname, useParams } from 'next/navigation';
import { Screensaver } from '@/components/pos/screensaver';
import { buildScreensaverMedia } from '@/lib/screensaver';
import { useIdleTimer, resolveScreensaverTimeoutMs } from '@/hooks/use-idle-timer';
import { useAuthStore } from '@/store/auth';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { usePOSSettings } from '@/hooks/usePOSSettings';

export function TerminalIdleScreensaver() {
  const pathname = usePathname();
  const params = useParams();
  const isTerminalSession = useAuthStore((s) => s.isTerminalSession);
  const hasSession = useAuthStore((s) => !!s.session);
  const outlet = useAuthStore((s) => s.outlet);
  const logout = useAuthStore((s) => s.logout);
  const { tenant } = useTenantBranding();
  const { data: posSettings } = usePOSSettings();

  const [active, setActive] = useState(false);

  // Only arm for an active PIN/terminal session, and never on the PIN page (it runs its own).
  const armed = hasSession && isTerminalSession && !pathname?.includes('/pin-login');

  const handleIdle = useCallback(() => {
    if (armed) setActive(true);
  }, [armed]);
  const handleActive = useCallback(() => {
    // While the screensaver is up, activity is consumed by its own dismiss handler — keep the
    // idle timer passive so it never re-arms underneath the overlay.
  }, []);

  // Resolve timeout from service_config/outlet setting → device local → 5-min default.
  const cfgSeconds =
    (posSettings as { screensaver_timeout_seconds?: number } | undefined)?.screensaver_timeout_seconds;
  const timeoutMs = resolveScreensaverTimeoutMs(cfgSeconds);

  // Pass undefined timeout when not armed so the hook stays inert (no overlay for SSO/owner).
  useIdleTimer(handleIdle, handleActive, armed ? timeoutMs : undefined);

  // Waking from the lock returns to the PIN pad: sign the terminal session out (auth store
  // redirects POS logout → /{orgSlug}/pin-login per sso-frontend-logout-standard).
  const dismiss = useCallback(() => {
    setActive(false);
    void logout();
  }, [logout]);

  if (!armed || !active) return null;

  // Same media precedence as the PIN page: managed slideshow (up to 3) → legacy single
  // URL → tenant brand URL → bundled per-slug defaults → branded gradient.
  const settings = posSettings as { screensaver_url?: string | null; screensaver_urls?: string[] } | undefined;
  const media = buildScreensaverMedia({
    configuredUrls: [
      ...(settings?.screensaver_urls ?? []),
      settings?.screensaver_url,
      tenant?.posScreensaverUrl,
    ],
    orgSlug: (params?.orgSlug as string | undefined) ?? tenant?.slug,
  });

  return (
    <Screensaver
      active={active}
      onDismiss={dismiss}
      screensaverUrl={media.videoUrl}
      playlist={media.images}
      tenantName={tenant?.orgName ?? tenant?.name}
      tenantLogoUrl={tenant?.logoUrl}
      outletName={outlet?.name}
    />
  );
}
