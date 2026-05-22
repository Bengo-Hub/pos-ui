'use client';

import { useCallback, useEffect, useState } from 'react';

const SSO_BASE_URL = process.env.NEXT_PUBLIC_SSO_URL || 'https://sso.codevertexitsolutions.com';

export type BiometricState = 'idle' | 'registering' | 'authenticating' | 'success' | 'error' | 'unsupported';

export interface UseBiometricOptions {
  onAuthSuccess?: (result: { accessToken: string; refreshToken: string; expiresIn: number }) => void;
  onError?: (error: string) => void;
}

export function useBiometric(options: UseBiometricOptions = {}) {
  const [state, setState] = useState<BiometricState>('idle');
  const [isSupported, setIsSupported] = useState(false);
  const [hasRegisteredCredential, setHasRegisteredCredential] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      !!window.PublicKeyCredential &&
      typeof navigator.credentials?.create === 'function';
    setIsSupported(supported);

    if (supported) {
      // Check if user has already registered a credential (stored flag).
      setHasRegisteredCredential(
        localStorage.getItem('pwa_biometric_registered') === 'true'
      );
    }
  }, []);

  const register = useCallback(
    async (accessToken: string, friendlyName?: string) => {
      if (!isSupported) {
        setError('Biometric login not supported on this device');
        setState('error');
        return false;
      }

      setState('registering');
      setError(null);

      try {
        // Step 1: begin registration
        const beginRes = await fetch(
          `${SSO_BASE_URL}/api/v1/auth/webauthn/register/begin`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (!beginRes.ok) {
          throw new Error('Failed to begin biometric registration');
        }

        const creationOptions = await beginRes.json();

        // Decode base64url challenge and user.id
        creationOptions.publicKey.challenge = base64URLToBuffer(
          creationOptions.publicKey.challenge
        );
        creationOptions.publicKey.user.id = base64URLToBuffer(
          creationOptions.publicKey.user.id
        );
        if (creationOptions.publicKey.excludeCredentials) {
          creationOptions.publicKey.excludeCredentials =
            creationOptions.publicKey.excludeCredentials.map((c: { id: string; type: string }) => ({
              ...c,
              id: base64URLToBuffer(c.id),
            }));
        }

        // Step 2: call browser API
        const credential = await navigator.credentials.create(creationOptions) as PublicKeyCredential;
        if (!credential) {
          throw new Error('No credential returned from browser');
        }

        // Step 3: finish registration
        const nameParam = friendlyName ? `?name=${encodeURIComponent(friendlyName)}` : '';
        const finishRes = await fetch(
          `${SSO_BASE_URL}/api/v1/auth/webauthn/register/finish${nameParam}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(credentialToJSON(credential)),
          }
        );

        if (!finishRes.ok) {
          const body = await finishRes.json().catch(() => ({}));
          throw new Error(body.message || 'Biometric registration failed');
        }

        localStorage.setItem('pwa_biometric_registered', 'true');
        setHasRegisteredCredential(true);
        setState('success');
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Registration failed';
        setError(message);
        setState('error');
        options.onError?.(message);
        return false;
      }
    },
    [isSupported, options]
  );

  const authenticate = useCallback(
    async (email: string, tenantSlug?: string) => {
      if (!isSupported) {
        setError('Biometric login not supported on this device');
        setState('error');
        return null;
      }

      setState('authenticating');
      setError(null);

      try {
        // Step 1: begin authentication
        const beginRes = await fetch(
          `${SSO_BASE_URL}/api/v1/auth/webauthn/authenticate/begin`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          }
        );

        if (!beginRes.ok) {
          const body = await beginRes.json().catch(() => ({}));
          if (beginRes.status === 404) {
            throw new Error('No biometric credentials registered. Please set up fingerprint login first.');
          }
          throw new Error(body.message || 'Failed to begin biometric login');
        }

        const sessionKey = beginRes.headers.get('X-WebAuthn-Session') ?? '';
        const assertionOptions = await beginRes.json();

        // Decode base64url fields
        assertionOptions.publicKey.challenge = base64URLToBuffer(
          assertionOptions.publicKey.challenge
        );
        if (assertionOptions.publicKey.allowCredentials) {
          assertionOptions.publicKey.allowCredentials =
            assertionOptions.publicKey.allowCredentials.map((c: { id: string; type: string }) => ({
              ...c,
              id: base64URLToBuffer(c.id),
            }));
        }

        // Step 2: call browser API
        const assertion = await navigator.credentials.get(assertionOptions) as PublicKeyCredential;
        if (!assertion) {
          throw new Error('Biometric authentication cancelled');
        }

        // Step 3: finish authentication
        const tenantParam = tenantSlug ? `?tenant=${encodeURIComponent(tenantSlug)}` : '';
        const finishRes = await fetch(
          `${SSO_BASE_URL}/api/v1/auth/webauthn/authenticate/finish${tenantParam}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-WebAuthn-Session': sessionKey,
            },
            body: JSON.stringify(credentialToJSON(assertion)),
          }
        );

        if (!finishRes.ok) {
          const body = await finishRes.json().catch(() => ({}));
          throw new Error(body.message || 'Biometric authentication failed');
        }

        const raw = await finishRes.json();
        const tokens = {
          accessToken: raw.access_token ?? raw.accessToken,
          refreshToken: raw.refresh_token ?? raw.refreshToken ?? '',
          expiresIn: raw.expires_in ?? raw.expiresIn ?? 3600,
        };
        setState('success');
        options.onAuthSuccess?.(tokens);
        return tokens;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Authentication failed';
        setError(message);
        setState('error');
        options.onError?.(message);
        return null;
      }
    },
    [isSupported, options]
  );

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
  }, []);

  return {
    isSupported,
    hasRegisteredCredential,
    state,
    error,
    isLoading: state === 'registering' || state === 'authenticating',
    register,
    authenticate,
    reset,
  };
}

// --- Helpers ---

function base64URLToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function bufferToBase64URL(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function credentialToJSON(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAttestationResponse | AuthenticatorAssertionResponse;

  if ('attestationObject' in response) {
    // Registration response
    const attestation = response as AuthenticatorAttestationResponse;
    return {
      id: credential.id,
      rawId: bufferToBase64URL(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64URL(attestation.clientDataJSON),
        attestationObject: bufferToBase64URL(attestation.attestationObject),
      },
    };
  } else {
    // Authentication response
    const assertion = response as AuthenticatorAssertionResponse;
    return {
      id: credential.id,
      rawId: bufferToBase64URL(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64URL(assertion.clientDataJSON),
        authenticatorData: bufferToBase64URL(assertion.authenticatorData),
        signature: bufferToBase64URL(assertion.signature),
        userHandle: assertion.userHandle ? bufferToBase64URL(assertion.userHandle) : null,
      },
    };
  }
}
