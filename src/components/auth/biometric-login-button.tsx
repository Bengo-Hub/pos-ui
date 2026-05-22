'use client';

import { useBiometric } from '@/hooks/use-biometric';
import { useAuthStore } from '@/store/auth';

interface BiometricLoginButtonProps {
  email: string;
  tenantSlug?: string;
  className?: string;
}

export function BiometricLoginButton({ email, tenantSlug, className }: BiometricLoginButtonProps) {
  const { authenticate, isSupported, hasRegisteredCredential, isLoading, error, state } = useBiometric({
    onAuthSuccess: (tokens) => {
      // Dispatch tokens into the auth store the same way SSO callback does.
      const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
      useAuthStore.getState().hydrateFromWebAuthn({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt,
      });
    },
  });

  if (!isSupported || !hasRegisteredCredential) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => authenticate(email, tenantSlug)}
        disabled={isLoading}
        className={`flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${className ?? ''}`}
        aria-label="Sign in with fingerprint or face"
      >
        {isLoading ? (
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1C6.48 1 2 5.48 2 11c0 3.27 1.5 6.18 3.84 8.12M12 1c5.52 0 10 4.48 10 10 0 3.27-1.5 6.18-3.84 8.12M12 1v1m0 21v-1" />
            <path d="M8 11c0-2.21 1.79-4 4-4s4 1.79 4 4c0 1.5-.82 2.8-2 3.54M8 11c0 2.21 1.79 4 4 4" />
          </svg>
        )}
        <span>{isLoading ? 'Verifying…' : 'Sign in with fingerprint'}</span>
      </button>
      {state === 'error' && error && (
        <p className="text-xs text-red-500 text-center">{error}</p>
      )}
    </div>
  );
}
