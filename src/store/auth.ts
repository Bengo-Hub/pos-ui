import { apiClient } from '@/lib/api/client';
import { buildAuthorizeUrl, buildLogoutUrl, exchangeCodeForTokens, fetchProfile, fetchPosServiceProfile, revokeServerSession } from '@/lib/auth/api';
import { setStoredOutletId } from '@/lib/auth/outlet-storage';
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

export interface OutletInfo {
  id: string;
  code: string;
  name: string;
  use_case?: string;
  is_hq?: boolean;
  status?: string;
}

/** Slug-scoped last-selected-outlet persistence (read by PIN login page and outlet selector). */
export { POS_SELECTED_OUTLET_KEY } from '@/lib/auth/outlet-storage';

interface AuthState {
  status: 'idle' | 'loading' | 'authenticated' | 'error' | 'syncing';
  user: UserProfile | null;
  session: Session | null;
  error: string | null;
  lastAuthenticatedAt: number | null;
  /** True when authenticated via terminal PIN JWT (not SSO). useMe() is skipped for terminal sessions. */
  isTerminalSession: boolean;
  /** Set to true after Zustand persist has finished loading from localStorage. Guards against SSO redirect race on page refresh. */
  _hasHydrated: boolean;

  /** Subscription info fetched lazily after login (undefined = not started, null = loading). */
  subscriptionInfo: Record<string, unknown> | null | undefined;
  setSubscriptionInfo: (info: Record<string, unknown> | null) => void;

  /**
   * Currently active outlet for this session.
   * Set by the outlet selector page after SSO login (stored in localStorage + persisted here).
   * Restored on rehydration to set apiClient X-Outlet-ID.
   */
  outlet: OutletInfo | null;
  /**
   * For HQ users doing a cross-outlet drill-down (different from their assigned outlet).
   * Propagated to apiClient as X-Outlet-ID when set; null clears the override.
   */
  selectedOutletId: string | null;

  /** Set the active outlet and store its ID in localStorage. Updates apiClient header. */
  setOutlet: (outlet: OutletInfo | null) => void;
  /** HQ user drill-down: override outlet context for queries without changing the user's home outlet. */
  setSelectedOutletId: (id: string | null) => void;

  initialize: () => Promise<void>;
  redirectToSSO: (orgSlug: string, returnTo?: string) => Promise<void>;
  handleSSOCallback: (orgSlug: string, code: string, callbackUrl: string) => Promise<void>;
  /**
   * Set a terminal PIN session after successful PIN login.
   * Stores the JWT in apiClient and marks the session as terminal
   * (bypasses SSO /auth/me check).
   */
  setTerminalSession: (token: string, user: UserProfile) => void;
  /** Hydrate session from WebAuthn tokens (biometric login). Triggers fetchUser() to populate user profile. */
  hydrateFromWebAuthn: (tokens: { accessToken: string; refreshToken: string; expiresAt: string }) => void;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  setUser: (user: UserProfile | null) => void;
  /**
   * Re-pulls the POS SERVICE-level role + fine-grained pos.*.* permissions from pos-api's own
   * /auth/me and merges them into the store, WITHOUT a full re-login. Fixes a real gap: the
   * service profile was previously fetched only ONCE at SSO callback, and PIN/terminal
   * sessions never called it again for the life of the 4h terminal JWT — so a permission a
   * manager granted mid-shift (role edit, new role assignment) never reached an already-open
   * session's sidebar/RouteGuard until the staff member fully logged out and back in. Called
   * periodically by ServicePermissionsRefresher in org-shell.tsx for BOTH session kinds (pos-api
   * /auth/me accepts SSO JWTs and terminal JWTs alike via RequireAnyAuth). Best-effort: a
   * failed refresh silently leaves the current permissions in place for the next tick.
   */
  refreshServicePermissions: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      _hasHydrated: false,
      subscriptionInfo: undefined,
      setSubscriptionInfo: (info: Record<string, unknown> | null) => set({ subscriptionInfo: info }),
      user: null,
      session: null,
      error: null,
      lastAuthenticatedAt: null,
      isTerminalSession: false,
      outlet: null,
      selectedOutletId: null,

      setOutlet: (outlet) => {
        set({ outlet });
        // Slug-scoped: the stored outlet only auto-selects again on the SAME tenant.
        setStoredOutletId(outlet?.id ?? null);
        // Always use the home outlet ID as the base X-Outlet-ID (unless a drill-down override is active)
        const { selectedOutletId } = get();
        if (!selectedOutletId) {
          apiClient.setOutletID(outlet?.id ?? null);
        }
      },

      setSelectedOutletId: (id) => {
        set({ selectedOutletId: id });
        // Drill-down takes precedence over the home outlet header
        apiClient.setOutletID(id ?? get().outlet?.id ?? null);
      },

      initialize: async () => {
        const { session, user, isTerminalSession, outlet } = get();
        if (!session) {
          set({ status: 'idle' });
          return;
        }

        apiClient.setAccessToken(session.accessToken);
        if (user) {
          apiClient.setTenantInfo(user.tenant_id, user.tenant_slug);
        }
        // Restore outlet header on page reload
        if (outlet?.id) {
          apiClient.setOutletID(outlet.id);
        }

        // Terminal sessions use a pos-api HMAC JWT — never validate against SSO /me.
        if (isTerminalSession) {
          set({ status: 'authenticated', lastAuthenticatedAt: Date.now() });
          return;
        }

        // If user profile is persisted and token hasn't expired, hydrate from storage
        // without a network call. A 60-second buffer guards against clock skew.
        if (user && session.expiresAt) {
          const expiresAt = new Date(session.expiresAt).getTime();
          if (Date.now() < expiresAt - 60_000) {
            set({ status: 'authenticated', lastAuthenticatedAt: Date.now() });
            return;
          }
        }

        set({ status: 'loading' });

        try {
          const freshUser = await fetchProfile(session.accessToken);
          apiClient.setTenantInfo(freshUser.tenant_id, freshUser.tenant_slug);
          // fetchProfile returns the SSO-only profile whose `permissions` do NOT include the
          // pos-api service union (pos.*.*). Overwriting `user` with it would transiently drop a
          // custom/elevated role's permissions (reports/module access) until the next service
          // refresh — the urban-loft "can't access reports" regression. Preserve the persisted
          // pos permissions optimistically, then re-fetch the authoritative pos union.
          set({
            user: {
              ...freshUser,
              permissions: user?.permissions?.length ? user.permissions : freshUser.permissions,
            },
            status: 'authenticated',
            lastAuthenticatedAt: Date.now(),
          });
          void get().refreshServicePermissions();
        } catch (err) {
          // Offline / weak-wifi reload: a network-shaped failure says nothing about the
          // session's validity — keep the persisted session so the terminal still works
          // from cache; the profile revalidates on the next successful request. Only a
          // real auth rejection (or missing persisted user) drops the session.
          const { isNetworkShapedError } = await import('@/lib/connectivity');
          if (isNetworkShapedError(err) && user) {
            set({ status: 'authenticated', lastAuthenticatedAt: Date.now() });
            return;
          }
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
              const ssoUser = await fetchProfile(session.accessToken);
              apiClient.setTenantInfo(ssoUser.tenant_id, ssoUser.tenant_slug);

              // Enrich with pos-api service-level role + permissions (Trinity Layer 3).
              // SSO JWT carries global roles; pos-api maps those to pos.*.* permissions.
              const svcProfile = await fetchPosServiceProfile(session.accessToken, ssoUser.tenant_id);
              const user = svcProfile
                ? {
                    ...ssoUser,
                    // Merge: pos-api role overrides global role for POS contexts
                    roles: [svcProfile.posRole, ...ssoUser.roles].filter(Boolean),
                    permissions: svcProfile.permissions,
                  }
                : ssoUser;

              if (typeof window !== 'undefined' && ssoUser.email) {
                localStorage.setItem('sso_last_email', ssoUser.email);
              }
              set({ user, status: 'authenticated', lastAuthenticatedAt: Date.now() });
              return;
            } catch {
              attempts++;
              await new Promise(r => setTimeout(r, 1500));
            }
          }

          set({ status: 'authenticated', lastAuthenticatedAt: Date.now() });
        } catch {
          set({ status: 'error', error: 'Sign-in failed' });
        }
      },

      setTerminalSession: (token: string, user: UserProfile) => {
        const session: Session = {
          accessToken: token,
          refreshToken: '',
          expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        };
        apiClient.setAccessToken(token);
        apiClient.setTenantInfo(user.tenant_id, user.tenant_slug);
        set({ session, user, status: 'authenticated', isTerminalSession: true, lastAuthenticatedAt: Date.now() });
      },

      hydrateFromWebAuthn: (tokens) => {
        const session: Session = {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        };
        apiClient.setAccessToken(tokens.accessToken);
        set({ session, status: 'loading', lastAuthenticatedAt: Date.now() });
        // Fetch user profile to complete hydration (same as SSO callback).
        get().fetchUser();
      },

      logout: async () => {
        const { user, session } = get();
        // The URL path is the source of truth for the org the user is working
        // in — the token's tenant_slug can differ (e.g. a platform owner whose
        // token was minted for codevertex while working inside another tenant).
        // Falling back to the token slug used to strand users on the WRONG
        // tenant's pin-login after logout.
        const pathSlug = typeof window !== 'undefined'
          ? (window.location.pathname.split('/')[1] ?? '')
          : '';
        const orgSlug = pathSlug || user?.tenant_slug || '';
        // Revoke the backend SSO session (Redis session_token keys + DB sessions)
        // before clearing local state, so refresh tokens can't be reused.
        await revokeServerSession(session?.accessToken);
        set({ status: 'idle', user: null, session: null, subscriptionInfo: undefined, lastAuthenticatedAt: null, isTerminalSession: false, outlet: null, selectedOutletId: null });
        apiClient.setAccessToken(null);
        apiClient.setTenantInfo(null, null);
        apiClient.setOutletID(null);
        if (typeof window !== 'undefined') {
          try { localStorage.removeItem('tenantId'); } catch { /* no-op */ }
          try { localStorage.removeItem('tenantSlug'); } catch { /* no-op */ }
          try { localStorage.removeItem('pos-auth-storage'); } catch { /* no-op */ }
          // POS_SELECTED_OUTLET_KEY is retained so pin-login auto-selects the last outlet —
          // safe now that it's slug-scoped: another tenant's slug never resolves this value.
          try { sessionStorage.clear(); } catch { /* no-op */ }
          // Always redirect to PIN login so staff re-authenticate locally.
          // No need to invalidate SSO sessions — pos-api HMAC and SSO tokens are both short-lived.
          window.location.href = orgSlug ? `/${orgSlug}/pin-login` : '/';
        }
      },

      fetchUser: async () => {
        const { session, user: prev } = get();
        if (!session) return;
        try {
          const user = await fetchProfile(session.accessToken);
          // Preserve any pos-service permissions from the prior user (fetchProfile is SSO-only),
          // then re-fetch the authoritative pos union so `user.permissions` never regresses to the
          // SSO-only set (see initialize()).
          set({
            user: {
              ...user,
              permissions: prev?.permissions?.length ? prev.permissions : user.permissions,
            },
          });
          void get().refreshServicePermissions();
        } catch (error) {
          console.error('Fetch user failed:', error);
        }
      },

      setUser: (user) => set({ user }),

      refreshServicePermissions: async () => {
        const { session, user, isTerminalSession } = get();
        if (!session?.accessToken || !user?.tenant_id) return;
        const svcProfile = await fetchPosServiceProfile(session.accessToken, user.tenant_id);
        if (!svcProfile) return; // best-effort — pos-api unreachable or 401; try again next tick
        const current = get().user;
        if (!current) return; // logged out mid-flight
        const nextRoles = isTerminalSession
          ? [svcProfile.posRole].filter(Boolean)
          : current.roles;
        set({
          user: {
            ...current,
            permissions: svcProfile.permissions,
            // Terminal sessions carry only the POS role in `roles` (mirrors setTerminalSession /
            // terminalToAuthClaims), so it's safe to fully replace it here. SSO sessions carry
            // GLOBAL roles from auth-service too, which this pos-api-only call doesn't know
            // about — leave `roles` untouched there; useMe()'s own periodic refetch keeps the
            // global roles fresh, and `permissions` (checked first by usePermissions) is what
            // actually drives gating.
            roles: nextRoles,
          },
        });
        // Keep the OFFLINE staff-profile cache (the weak-wifi/offline PIN bcrypt fallback in
        // pin-login/page.tsx) in step with the live permissions we just confirmed. Without this,
        // that cache's `permissions` field is frozen at whatever was cached on the staff member's
        // very first-ever successful ONLINE login (refreshStaffProfiles's periodic sync never
        // touches `permissions` — the public pre-auth profile-list endpoint it reads deliberately
        // doesn't expose them) — so a role edit could silently never reach a device that keeps
        // falling into the offline branch (a 5s network timeout is enough to trigger it even while
        // nominally "online" on weak wifi), no matter how many times that staff member logs out and
        // back in. Best-effort; never let a cache-write failure break the live session.
        try {
          const { cacheStaffProfile, getCachedStaffProfile } = await import('@/lib/db/pos-db');
          const existing = await getCachedStaffProfile(current.id);
          await cacheStaffProfile({
            user_id: current.id,
            tenant_id: current.tenant_id,
            name: current.fullName ?? existing?.name ?? '',
            email: current.email ?? existing?.email ?? '',
            roles: nextRoles,
            permissions: svcProfile.permissions,
            pin_hash: existing?.pin_hash,
            cached_at: new Date().toISOString(),
          });
        } catch {
          // best-effort — offline cache write failures never break the live session
        }
      },
    }),
    {
      name: 'pos-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        session: state.session,
        user: state.user,
        isTerminalSession: state.isTerminalSession,
        outlet: state.outlet,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.session?.accessToken) {
          apiClient.setAccessToken(state.session.accessToken);
        }
        if (state?.user?.tenant_id) {
          apiClient.setTenantInfo(state.user.tenant_id, state.user.tenant_slug);
        }
        // Restore outlet header so first API call already has X-Outlet-ID.
        if (state?.outlet?.id) {
          apiClient.setOutletID(state.outlet.id);
        }
        // Signal rehydration complete. If session + user are present, immediately
        // mark as authenticated so the header doesn't flash unauthenticated state
        // while waiting for initialize() to run.
        if (state?.session && state?.user) {
          useAuthStore.setState({ _hasHydrated: true, status: 'authenticated' });
        } else {
          useAuthStore.setState({ _hasHydrated: true });
        }
      },
    }
  )
);
