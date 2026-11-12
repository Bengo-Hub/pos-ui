'use client';

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_TIME_ZONE,
  getActiveTimeZone,
  resolveTimeZone,
  subscribeTimeZone,
  type TimeZoneTenant,
  type TimeZoneUser,
} from '@/lib/user-timezone';

/**
 * The zone this screen should show times in: the active zone set from /me, re-rendering when it
 * changes, or the zone resolved from the given user and tenant. Moves to shared-ui-lib v0.1.145.
 */
export function useUserTimeZone(user?: TimeZoneUser | null, tenant?: TimeZoneTenant | null): string {
  const active = useSyncExternalStore(subscribeTimeZone, getActiveTimeZone, () => DEFAULT_TIME_ZONE);
  if (user === undefined && tenant === undefined) return active;
  return resolveTimeZone(user, tenant);
}
