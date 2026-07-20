import { apiClient } from '@/lib/api/client';
import { getStoredOutletId } from '@/lib/auth/outlet-storage';
import { type OutletInfo } from '@/store/auth';

/**
 * resolveActiveOutlet — fetch the tenant's outlets and pick the one this session should
 * run as, preferring (in order):
 *   1. an explicit preferred id — the caller passes the user's ASSIGNED/home outlet
 *      (StaffOutlet), so a staff member always lands on the outlet they're tied to;
 *   2. the last-used outlet id from localStorage;
 *   3. the only outlet (single-outlet tenant);
 *   4. the tenant DEFAULT / HQ outlet (the "default/main" fallback for an unassigned
 *      HQ/admin user);
 *   5. the first active outlet.
 *
 * Used by the OutletContextHealer (org-shell) to repair sessions whose store outlet is
 * missing/incomplete AND to preselect the assigned outlet on a fresh login: SSO logins used to
 * short-circuit past the outlet selector on a leftover `pos-selected-outlet-id` WITHOUT hydrating
 * the store, leaving outlet.use_case unresolved — so useModuleAccess never resolved and the
 * sidebar sat on its skeleton forever (PIN login always sets a full outlet, which is why it worked).
 */
export async function resolveActiveOutlet(
  tenantID: string,
  preferredId?: string | null,
): Promise<OutletInfo | null> {
  const res = await apiClient.get<{ data: OutletInfo[] } | OutletInfo[]>(
    `/api/v1/${tenantID}/pos/outlets`,
  );
  const list: OutletInfo[] = Array.isArray(res) ? res : ((res as any)?.data ?? []);
  const active = list.filter((o) => (o as any).status !== 'archived');
  if (active.length === 0) return null;

  // Slug-scoped (URL path slug): a stale outlet persisted under another tenant is ignored.
  const storedId = getStoredOutletId() || null;

  return (
    (preferredId && active.find((o) => o.id === preferredId)) ||
    (storedId && active.find((o) => o.id === storedId)) ||
    (active.length === 1 ? active[0] : null) ||
    active.find((o) => (o as any).is_default) ||
    active.find((o) => (o as any).is_hq) ||
    active[0]
  );
}
