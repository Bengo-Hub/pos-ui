import { apiClient } from '@/lib/api/client';
import { buildAuthorizeUrl, buildLogoutUrl, exchangeCodeForTokens, fetchProfile } from '@/lib/auth/api';
import { checkSubscription } from '@/lib/auth/subscription';
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
  permissions: string[];
  tenant_id: string;
  tenant_slug: string;
  isPlatformOwner?: boolean;
  isSuperUser?: boolean;
}

interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

interface AuthState {
  status: 'idle' | 'loading' | 'authenticated' | 'error' | 'syncing' | 'subscription_required';
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
        const { session, user } = get();
        if (!session) {
          set({ status: 'idle' });
          return;
        }

        apiClient.setAccessToken(session.accessToken);
        if (user) {
          apiClient.setTenantInfo(user.tenant_id, user.tenant_slug);
        }
        set({ status: 'loading' });

        try {
          const user = await fetchProfile(session.accessToken);
          apiClient.setTenantInfo(user.tenant_id, user.tenant_slug);
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
              if (user.tenant_slug !== 'codevertex' && user.tenant_id) {
                const active = await checkSubscription(user.tenant_id, user.tenant_slug ?? '', session.accessToken);
                if (!active) {
                  set({ status: 'subscription_required' });
                  return;
                }
              }
              apiClient.setTenantInfo(user.tenant_id, user.tenant_slug);
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
        apiClient.setTenantInfo(null, null);
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
        if (state?.user?.tenant_id) {
          apiClient.setTenantInfo(state.user.tenant_id, state.user.tenant_slug);
        }
      },
    }
  )
);
