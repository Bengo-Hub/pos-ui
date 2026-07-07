import { apiClient } from '@/lib/api/client';
import { cacheStaffProfile, getCachedStaffProfile } from '@/lib/db/pos-db';

/** Shape of the public PIN profile list (pos-api /pos/auth/pin/profile). */
export interface StaffProfileListItem {
  user_id: string;
  tenant_id: string;
  name: string;
  role?: string;
}

/**
 * Refresh the IndexedDB staff-profile cache from the public PIN profile list, PRESERVING
 * any pin_hash already cached at login — the public list never carries hashes (exposing
 * 4-digit-PIN bcrypt publicly would be trivially brute-forceable), and wiping one would
 * kill that staff member's offline re-login.
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
  for (const p of list) {
    const existing = await getCachedStaffProfile(p.user_id);
    await cacheStaffProfile({
      user_id:     p.user_id,
      tenant_id:   p.tenant_id,
      name:        p.name,
      email:       existing?.email ?? '',
      roles:       p.role ? [p.role] : existing?.roles ?? [],
      permissions: existing?.permissions ?? [],
      pin_hash:    existing?.pin_hash,
      cached_at:   new Date().toISOString(),
    });
  }
  return list;
}
