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
      const returnTo = sessionStorage.getItem('sso_return_to') || `/${orgSlug}`;
      sessionStorage.removeItem('sso_return_to');
      router.replace(returnTo);
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
