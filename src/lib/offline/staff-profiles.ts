import { apiClient } from '@/lib/api/client';
import { cacheStaffProfile, getCachedStaffProfiles } from '@/lib/db/pos-db';
import { mergePinProfiles, type PinProfileListItem } from '@/lib/offline/staff-profile-merge';

/** Shape of the public PIN profile list (pos-api /pos/auth/pin/profile): no user id, no role. */
export type StaffProfileListItem = PinProfileListItem;

/**
 * Refresh the names in the IndexedDB staff-profile cache from the public PIN profile list,
 * matching rows by staff id and PRESERVING the pin_hash cached at login. The public list never
 * carries hashes (exposing a 4-digit PIN's bcrypt publicly would be trivially brute-forceable)
 * and, since 2026-11-11, never the auth user id or role either, so it can only refresh rows a
 * login on this device already wrote (see mergePinProfiles).
 *
 * Shared by the PIN page's warm-up query and the 5-min background sync job (so offline
 * PIN keeps working even when nobody has visited the PIN page this session).
 */
export async function refreshStaffProfiles(
  tenantID: string,
  outletId?: string,
): Promise<StaffProfileListItem[]> {
  const params = outletId ? `?outlet_id=${outletId}` : '';
  const body = await apiClient.get<{ data: StaffProfileListItem[] }>(
    `/api/v1/${tenantID}/pos/auth/pin/profile${params}`,
    undefined,
    { suppressErrorToast: true },
  );
  const list = body.data ?? [];
  const cached = await getCachedStaffProfiles(tenantID);
  for (const row of mergePinProfiles(list, cached, new Date().toISOString())) {
    await cacheStaffProfile(row);
  }
  return list;
}
