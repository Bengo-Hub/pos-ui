'use client';

import { apiClient } from '@/lib/api/client';
import { useMe } from '@/hooks/useMe';
import { useAuthStore } from '@/store/auth';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';

const KIOSK_PATHS = ['/pin-login'];

function isKioskPath(pathname: string | null): boolean {
  return KIOSK_PATHS.some(p => pathname?.endsWith(p) || pathname?.includes(p + '/'));
}

/** Uses TanStack Query (useMe) for auth-api GET /me with TTL; roles/permissions for nav and route protection. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { status, initialize, isTerminalSession } = useAuthStore();
  const session = useAuthStore((s) => s.session);
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

  useEffect(() => {
    initialize();
  }, [initialize]);

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

  // SSO redirect for unauthenticated users — skip for kiosk and auth callback paths
  useEffect(() => {
    if (isKiosk || isTerminalSession) return;
    if (status === 'idle' && !pathname?.includes('/auth') && orgSlug) {
      useAuthStore.getState().redirectToSSO(orgSlug, window.location.href);
    }
  }, [status, pathname, orgSlug, isKiosk, isTerminalSession]);

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

  return <>{children}</>;
}
