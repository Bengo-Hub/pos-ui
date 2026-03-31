'use client';

import { apiClient } from '@/lib/api/client';
import { useMe } from '@/hooks/useMe';
import { useAuthStore } from '@/store/auth';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';

/** Uses TanStack Query (useMe) for auth-api GET /me with TTL; roles/permissions for nav and route protection. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { status, initialize } = useAuthStore();
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const { isLoading: meLoading, isError, error } = useMe();
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const orgSlug = params?.orgSlug as string;
  const queryClient = useQueryClient();

  const isAuthCallback = pathname?.includes('/auth');
  const isUnauthorizedPage = pathname?.endsWith('/unauthorized');

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Register 401 handler: clear all caches and redirect to SSO.
  // Skip during syncing/loading to avoid clearing session during JIT sync.
  // Also skip within 15s of authentication (tokens may still be propagating).
  // Note: the primary defense is token refresh in client.ts — this callback
  // only fires after refresh has already failed.
  useEffect(() => {
    apiClient.setOn401(() => {
      const { status, lastAuthenticatedAt } = useAuthStore.getState();
      if (status === 'syncing' || status === 'loading') return;
      if (lastAuthenticatedAt && Date.now() - lastAuthenticatedAt < 15_000) return;
      queryClient.clear();
      void logout();
    });
    return () => apiClient.setOn401(null);
  }, [queryClient, logout]);

  useEffect(() => {
    if (status === 'idle' && !pathname?.includes('/auth') && orgSlug) {
      useAuthStore.getState().redirectToSSO(orgSlug, window.location.href);
    }
  }, [status, pathname, orgSlug]);

  useEffect(() => {
    if (!session || isUnauthorizedPage || meLoading) return;
    const statusCode =
      (error as { response?: { status?: number }; status?: number })?.response?.status ??
      (error as { status?: number })?.status;
    if (isError && statusCode === 403 && orgSlug) {
      // Skip redirect for subscription 403 — let SubscriptionBanner handle it
      const data = (error as any)?.response?.data;
      if (data?.code === 'subscription_inactive' || data?.upgrade === true) return;
      router.replace(`/${orgSlug}/unauthorized`);
    }
  }, [session, isError, error, isUnauthorizedPage, meLoading, orgSlug, router]);

  const loading = status === 'loading' || (!!session && meLoading);
  if (loading && !isAuthCallback) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Initializing session...</div>
      </div>
    );
  }

  return <>{children}</>;
}
