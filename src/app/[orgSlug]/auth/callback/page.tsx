'use client';

import { consumeState } from '@/lib/auth/pkce';
import { resolveActiveOutlet } from '@/lib/auth/outlet-resolver';
import { useAuthStore } from '@/store/auth';
import { SSOCallbackError } from '@bengo-hub/shared-ui-lib/auth';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

// The stored return URL was captured BEFORE the SSO hop. If the user switched
// organisation mid-login (accounts org picker), its slug is stale — re-point the
// first path segment at the org the token was actually issued for. Cross-origin
// values are dropped entirely.
function sanitizedReturnTo(raw: string | null, orgSlug: string): string | null {
  if (!raw) return null;
  try {
    const url = raw.startsWith('http') ? new URL(raw) : new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const segments = url.pathname.split('/');
    if (segments[1] && segments[1] !== orgSlug) segments[1] = orgSlug;
    return segments.join('/') + url.search + url.hash;
  } catch {
    return null;
  }
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const code = searchParams?.get('code');
  const error = searchParams?.get('error');
  const errorDescription = searchParams?.get('error_description');
  const { handleSSOCallback, status, error: authError } = useAuthStore();
  const hasStarted = useRef(false);
  const [stateError, setStateError] = useState<string | null>(null);

  useEffect(() => {
    if (code && orgSlug && !hasStarted.current) {
      hasStarted.current = true;
      // CSRF binding: the state we sent with the authorize request must come
      // back unchanged. Only enforced when we still hold the stored value —
      // a missing verifier is already handled by the exchange itself.
      const returnedState = searchParams?.get('state');
      const expectedState = consumeState();
      if (expectedState && returnedState !== expectedState) {
        setStateError('Sign-in session mismatch. Please try again.');
        return;
      }
      const callbackUrl = `${window.location.origin}/${orgSlug}/auth/callback`;
      handleSSOCallback(orgSlug, code, callbackUrl);
    }
  }, [code, orgSlug, handleSSOCallback, searchParams]);

  useEffect(() => {
    if (status === 'authenticated') {
      const returnTo = sanitizedReturnTo(sessionStorage.getItem('sso_return_to'), orgSlug);
      sessionStorage.removeItem('sso_return_to');

      const storedOutlet = typeof window !== 'undefined'
        ? localStorage.getItem('pos-selected-outlet-id')
        : null;

      const { user: authUser, setOutlet, outlet: storeOutlet } = useAuthStore.getState();

      // A leftover last-used outlet id skips the selector — but ONLY as a route decision.
      // Logout clears the STORE outlet while keeping this key (pin-login auto-select), so
      // the store must be re-hydrated with the full outlet (incl. use_case) or the sidebar
      // never resolves its modules ("sidebar items fail to load"). Hydrate here when we
      // can; the org-shell OutletContextHealer covers any path that lands unresolved.
      if (storedOutlet) {
        if (!storeOutlet?.use_case) {
          resolveActiveOutlet(authUser?.tenant_id ?? '', storedOutlet)
            .then((o) => { if (o) useAuthStore.getState().setOutlet(o); })
            .catch(() => { /* healer retries from the shell */ });
        }
        router.replace(returnTo || `/${orgSlug}`);
        return;
      }

      // Auto-preselect outlet from JWT claims for non-HQ single-outlet users.
      // This skips the outlet selector entirely for staff assigned to one outlet.
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

  if (error || authError || stateError) {
    const lastKnownTenant = typeof window !== 'undefined' ? localStorage.getItem('tenantSlug') : null;
    return (
      <SSOCallbackError
        error={error || 'auth_error'}
        errorDescription={errorDescription || authError || stateError}
        orgSlug={orgSlug}
        lastKnownTenant={lastKnownTenant}
        onRetry={() => {
          useAuthStore.getState().redirectToSSO(orgSlug, `${window.location.origin}/${orgSlug}`);
        }}
        onSwitchTenant={(slug) => router.replace(`/${slug}`)}
      />
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
