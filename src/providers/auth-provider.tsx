'use client';

import { useMe } from '@/hooks/useMe';
import { useAuthStore } from '@/store/auth';
import { useParams, usePathname } from 'next/navigation';
import { ReactNode, useEffect } from 'react';

/** Uses TanStack Query (useMe) for auth-api GET /me with TTL; roles/permissions for nav and route protection. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { status, initialize } = useAuthStore();
  const { isLoading: meLoading } = useMe();
  const pathname = usePathname();
  const params = useParams();
  const orgSlug = params?.orgSlug as string;

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (status === 'idle' && !pathname?.includes('/auth')) {
      if (orgSlug) {
        useAuthStore.getState().redirectToSSO(orgSlug, window.location.href);
      }
    }
  }, [status, pathname, orgSlug]);

  const loading = status === 'loading' || (status === 'authenticated' && meLoading);
  if (loading && !pathname?.includes('/auth')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Initializing session...</div>
      </div>
    );
  }

  return <>{children}</>;
}
