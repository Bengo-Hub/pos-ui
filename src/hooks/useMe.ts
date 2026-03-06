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
  organizationId?: string;
}

export function useMe() {
  const { session, setUser } = useAuthStore();
  const accessToken = session?.accessToken ?? null;

  const query = useQuery({
    queryKey: ['auth-me', accessToken],
    queryFn: async () => {
      if (!accessToken) return null;
      const user = await fetchProfile(accessToken);
      setUser(user as MeProfile);
      return user as MeProfile;
    },
    enabled: !!accessToken,
    staleTime: ME_STALE_TIME_MS,
    retry: false,
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
