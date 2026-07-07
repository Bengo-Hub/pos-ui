'use client';

import { fetchProfile } from '@/lib/auth/api';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';

const ME_STALE_TIME_MS = 5 * 60 * 1000; // 5 min TTL

export interface MeProfile {
  id: string;
  email: string;
  fullName?: string;
  roles: string[];
  permissions?: string[];
  tenant_id?: string;
  tenant_slug?: string;
  is_platform_owner?: boolean;
}

export function useMe() {
  const { session, setUser, isTerminalSession } = useAuthStore();
  const accessToken = session?.accessToken ?? null;

  const query = useQuery({
    queryKey: ['auth-me', accessToken],
    queryFn: async () => {
      if (!accessToken) return null;
      let profile: MeProfile;
      try {
        profile = (await fetchProfile(accessToken)) as MeProfile;
      } catch (err) {
        // Weak wifi / offline: serve the last-known profile snapshot instead of erroring —
        // the persisted zustand user stays authoritative for rendering; auth errors still throw.
        const { isNetworkShapedError } = await import('@/lib/connectivity');
        if (isNetworkShapedError(err)) {
          const { getSnapshot } = await import('@/lib/db/pos-db');
          const tenantId = useAuthStore.getState().user?.tenant_id ?? '';
          const snap = await getSnapshot<MeProfile>(`me:${tenantId}`);
          if (snap) return snap;
        }
        throw err;
      }
      setUser(
        profile
          ? {
              id: profile.id,
              email: profile.email ?? '',
              fullName: profile.fullName ?? '',
              roles: profile.roles ?? [],
              permissions: profile.permissions ?? [],
              tenant_id: profile.tenant_id ?? '',
              tenant_slug: profile.tenant_slug ?? '',
              isPlatformOwner: profile.is_platform_owner ?? false,
              isSuperUser: (profile.roles ?? []).includes('superuser'),
            }
          : null,
      );
      // Write the me: snapshot so an offline/weak-wifi reload can still resolve the profile.
      if (profile?.tenant_id) {
        const { cacheSnapshot } = await import('@/lib/db/pos-db');
        void cacheSnapshot(`me:${profile.tenant_id}`, profile.tenant_id, profile).catch(() => {});
      }
      return profile;
    },
    networkMode: 'always',
    // Never hit /auth/me for terminal sessions — the JWT is not an SSO token
    enabled: !!accessToken && !isTerminalSession,
    staleTime: ME_STALE_TIME_MS,
    gcTime: ME_STALE_TIME_MS * 2,
    retry: (failureCount, error: any) => {
      if (error?.response?.status === 401 || error?.response?.status === 403) return false;
      return failureCount < 2;
    },
  });

  const user = query.data ?? useAuthStore.getState().user;

  const hasRole = (role: string) => {
    if (!user?.roles) return false;
    return user.roles.includes(role) || user.roles.includes('super_admin') || user.roles.includes('admin');
  };

  const hasPermission = (permission: string) => {
    if (!user) return false;
    if (user.roles?.includes('super_admin') || user.roles?.includes('admin')) return true;
    return (user as MeProfile).permissions?.includes(permission) ?? false;
  };

  return {
    user,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    hasRole,
    hasPermission,
    isAuthenticated: !!user,
  };
}
