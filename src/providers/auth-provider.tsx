'use client';

import { apiClient } from '@/lib/api/client';
import { parseLimitInfo, subscriptionErrorMessage } from '@/lib/api/error-handler';
import { LimitReachedModal } from '@/components/subscription/limit-reached-modal';
import { useLimitModal } from '@/store/limit-modal';
import { useMe } from '@/hooks/useMe';
import { useAuthStore } from '@/store/auth';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { toast } from 'sonner';

const KIOSK_PATHS = ['/pin-login'];

function isKioskPath(pathname: string | null): boolean {
  return KIOSK_PATHS.some(p => pathname?.endsWith(p) || pathname?.includes(p + '/'));
}

/** Uses TanStack Query (useMe) for auth-api GET /me with TTL; roles/permissions for nav and route protection. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { status, initialize, isTerminalSession } = useAuthStore();
  const session = useAuthStore((s) => s.session);
  const _hasHydrated = useAuthStore((s) => s._hasHydrated);
  const logout = useAuthStore((s) => s.logout);
  const { isLoading: meLoading, isError, error } = useMe();
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const orgSlug = params?.orgSlug as string;
  const queryClient = useQueryClient();

  const isAuthCallback   = pathname?.includes('/auth');
  const isUnauthorizedPage = pathname?.endsWith('/unauthorized');
  const isKiosk = isKioskPath(pathname);

  // Wait for Zustand localStorage rehydration before running initialize to prevent
  // the race where isTerminalSession=false fires before persisted state is loaded.
  useEffect(() => {
    if (!_hasHydrated) return;
    initialize();
  }, [initialize, _hasHydrated]);

  // Register 401 handler. Terminal sessions redirect to pin-login instead of SSO.
  useEffect(() => {
    apiClient.setOn401(() => {
      const { status: s, lastAuthenticatedAt, isTerminalSession: isTerm } = useAuthStore.getState();
      if (s === 'syncing' || s === 'loading') return;
      if (lastAuthenticatedAt && Date.now() - lastAuthenticatedAt < 15_000) return;
      queryClient.clear();
      if (isTerm) {
        // Terminal JWT expired — send back to PIN login, not SSO
        void useAuthStore.getState().logout().then(() => {
          if (orgSlug) router.replace(`/${orgSlug}/pin-login`);
        });
      } else {
        void logout();
      }
    });
    return () => apiClient.setOn401(null);
  }, [queryClient, logout, orgSlug, router]);

  // Wire subscription 403 → sonner toast with upgrade action
  useEffect(() => {
    apiClient.setOnSubscription403((data) => {
      const message = subscriptionErrorMessage(data);
      toast.error('Subscription limit reached', {
        description: message,
        duration: 8000,
        action: orgSlug
          ? {
              label: 'Upgrade plan',
              onClick: () => router.push(`/${orgSlug}/settings/billing`),
            }
          : undefined,
      });
    });
    return () => apiClient.setOnSubscription403(null);
  }, [orgSlug, router]);

  // Wire 402 metered-limit-reached → extra-usage modal
  useEffect(() => {
    apiClient.setOnLimitReached((data) => {
      const info = parseLimitInfo(data);
      if (info) useLimitModal.getState().show(info);
    });
    return () => apiClient.setOnLimitReached(null);
  }, []);

  // Wire 5xx server errors → sonner toast
  useEffect(() => {
    apiClient.setOnServerError((_status, message) => {
      toast.error('Server error', {
        description: message,
        duration: 6000,
      });
    });
    return () => apiClient.setOnServerError(null);
  }, []);

  // SSO redirect for unauthenticated users — skip for kiosk, terminal sessions, and auth callback paths.
  // Also skip until rehydration is complete to prevent spurious SSO redirects on page refresh
  // when persisted isTerminalSession/session haven't been restored from localStorage yet.
  useEffect(() => {
    if (!_hasHydrated) return;
    if (isKiosk || isTerminalSession) return;
    if (session) return;
    if (status === 'idle' && !pathname?.includes('/auth') && orgSlug) {
      useAuthStore.getState().redirectToSSO(orgSlug, window.location.href);
    }
  }, [status, session, pathname, orgSlug, isKiosk, isTerminalSession, _hasHydrated]);

  // Forbidden (403) redirect — skip for terminal sessions (no subscription concept)
  useEffect(() => {
    if (!session || isUnauthorizedPage || meLoading || isTerminalSession) return;
    const statusCode =
      (error as { response?: { status?: number }; status?: number })?.response?.status ??
      (error as { status?: number })?.status;
    if (isError && statusCode === 403 && orgSlug) {
      const data = (error as any)?.response?.data;
      if (data?.code === 'subscription_inactive' || data?.upgrade === true) return;
      router.replace(`/${orgSlug}/unauthorized`);
    }
  }, [session, isError, error, isUnauthorizedPage, meLoading, orgSlug, router, isTerminalSession]);

  const loading = !isKiosk && !isTerminalSession && (status === 'loading' || (!!session && meLoading));
  if (loading && !isAuthCallback) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Initializing session...</div>
      </div>
    );
  }

  return (
    <>
      {children}
      <LimitReachedModal />
    </>
  );
}
