'use client';

import { useAuthStore } from '@/store/auth';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const code = searchParams?.get('code');
  const error = searchParams?.get('error');
  const { handleSSOCallback, status, error: authError } = useAuthStore();
  const hasStarted = useRef(false);

  useEffect(() => {
    if (code && orgSlug && !hasStarted.current) {
      hasStarted.current = true;
      const callbackUrl = `${window.location.origin}/${orgSlug}/auth/callback`;
      handleSSOCallback(orgSlug, code, callbackUrl);
    }
  }, [code, orgSlug, handleSSOCallback]);

  useEffect(() => {
    if (status === 'authenticated') {
      const returnTo = sessionStorage.getItem('sso_return_to');
      sessionStorage.removeItem('sso_return_to');

      const storedOutlet = typeof window !== 'undefined'
        ? localStorage.getItem('pos-selected-outlet-id')
        : null;

      if (storedOutlet) {
        router.replace(returnTo || `/${orgSlug}`);
        return;
      }

      // Auto-preselect outlet from JWT claims for non-HQ single-outlet users.
      // This skips the outlet selector entirely for staff assigned to one outlet.
      const { user: authUser, setOutlet } = useAuthStore.getState();
      const jwtOutletId = (authUser as any)?.outlet_id || (authUser as any)?.outletId;
      const isHqUser = (authUser as any)?.is_hq_user || (authUser as any)?.isHqUser;

      if (jwtOutletId && !isHqUser) {
        setOutlet({
          id: jwtOutletId,
          code: (authUser as any)?.outlet_code ?? '',
          name: (authUser as any)?.outlet_code ?? '',
          use_case: (authUser as any)?.outlet_use_case,
          is_hq: false,
        });
        router.replace(returnTo || `/${orgSlug}`);
        return;
      }

      const next = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
      router.replace(`/${orgSlug}/auth/select-outlet${next}`);
    }
  }, [status, orgSlug, router]);

  if (error || authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8 border border-destructive/20 rounded-xl bg-destructive/5 max-w-md">
          <h1 className="text-xl font-bold text-destructive mb-2">Authentication Failed</h1>
          <p className="text-muted-foreground">{error || authError}</p>
          <button
            onClick={() => router.replace(`/${orgSlug}/auth`)}
            className="mt-6 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <h1 className="text-xl font-medium">Completing Sign-in...</h1>
        <p className="text-muted-foreground">Syncing your profile and permissions.</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthCallbackContent />
    </Suspense>
  );
}
