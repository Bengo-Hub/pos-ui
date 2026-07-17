import { apiClient } from '@/lib/api/client';
import { getStoredOutletId } from '@/lib/auth/outlet-storage';
import { type OutletInfo } from '@/store/auth';

/**
 * resolveActiveOutlet — fetch the tenant's outlets and pick the one this session should
 * run as, preferring (in order): an explicit preferred id → the last-used outlet id from
 * localStorage → the only outlet → the HQ outlet → the first active outlet.
 *
 * Used by the OutletContextHealer (org-shell) to repair sessions whose store outlet is
 * missing/incomplete: SSO logins used to short-circuit past the outlet selector on a
 * leftover `pos-selected-outlet-id` WITHOUT hydrating the store, leaving outlet.use_case
 * unresolved — so useModuleAccess never resolved and the sidebar sat on its skeleton
 * forever (PIN login always sets a full outlet, which is why it worked).
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
    active.find((o) => (o as any).is_hq) ||
    active[0]
  );
}
