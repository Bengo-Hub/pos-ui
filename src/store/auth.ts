import { apiClient } from '@/lib/api/client';
import { buildAuthorizeUrl, buildLogoutUrl, exchangeCodeForTokens, fetchProfile } from '@/lib/auth/api';
import {
    consumeVerifier,
    generateCodeChallenge,
    generateCodeVerifier,
    generateState,
    storeState,
    storeVerifier
} from '@/lib/auth/pkce';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  organizationId: string;
}

interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

interface AuthState {
  status: 'idle' | 'loading' | 'authenticated' | 'error' | 'syncing';
  user: UserProfile | null;
  session: Session | null;
  error: string | null;

  initialize: () => Promise<void>;
  redirectToSSO: (orgSlug: string, returnTo?: string) => Promise<void>;
  handleSSOCallback: (orgSlug: string, code: string, callbackUrl: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  setUser: (user: UserProfile | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      user: null,
      session: null,
      error: null,

      initialize: async () => {
        const { session } = get();
        if (!session) {
          set({ status: 'idle' });
          return;
        }

        apiClient.setAccessToken(session.accessToken);
        set({ status: 'loading' });

        try {
          const user = await fetchProfile(session.accessToken);
          set({ user, status: 'authenticated' });
        } catch {
          set({ status: 'idle', session: null, user: null });
        }
      },

      redirectToSSO: async (orgSlug: string, returnTo?: string) => {
        set({ status: 'loading', error: null });
        try {
          const verifier = generateCodeVerifier();
          const challenge = await generateCodeChallenge(verifier);
          const state = generateState();

          storeVerifier(verifier);
          storeState(state);

          if (returnTo && typeof window !== 'undefined') {
            sessionStorage.setItem('sso_return_to', returnTo);
          }

          const callbackUrl = `${window.location.origin}/${orgSlug}/auth/callback`;
          const authorizeUrl = buildAuthorizeUrl({
            codeChallenge: challenge,
            state,
            redirectUri: callbackUrl,
            tenant: orgSlug,
          });

          window.location.href = authorizeUrl;
        } catch {
          set({ status: 'error', error: 'Failed to start sign-in' });
        }
      },

      handleSSOCallback: async (orgSlug: string, code: string, callbackUrl: string) => {
        set({ status: 'syncing', error: null });
        const verifier = consumeVerifier();

        if (!verifier) {
          set({ status: 'error', error: 'Session expired' });
          return;
        }

        try {
          const tokens = await exchangeCodeForTokens({
            code,
            codeVerifier: verifier,
            redirectUri: callbackUrl,
          });

          const session: Session = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || '',
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          };

          apiClient.setAccessToken(session.accessToken);
          set({ session });

          let attempts = 0;
          while (attempts < 5) {
            try {
              const user = await fetchProfile(session.accessToken);
              set({ user, status: 'authenticated' });
              return;
            } catch {
              attempts++;
              await new Promise(r => setTimeout(r, 1500));
            }
          }

          set({ status: 'authenticated' });
        } catch {
          set({ status: 'error', error: 'Sign-in failed' });
        }
      },

      logout: async () => {
        set({ status: 'idle', user: null, session: null });
        apiClient.setAccessToken(null);
        window.location.href = buildLogoutUrl(window.location.origin);
      },

      fetchUser: async () => {
        const { session } = get();
        if (!session) return;
        try {
          const user = await fetchProfile(session.accessToken);
          set({ user });
        } catch (error) {
          console.error('Fetch user failed:', error);
        }
      },

      setUser: (user) => set({ user }),
    }),
    {
      name: 'pos-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        session: state.session,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.session?.accessToken) {
          apiClient.setAccessToken(state.session.accessToken);
        }
      },
    }
  )
);
