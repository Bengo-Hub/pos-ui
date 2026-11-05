import type { UserProfile } from '@/store/auth';

/** Canonical admin/manager-tier role names (current POS vocabulary + SSO/global + legacy aliases)
 *  that grant access to every outlet in the tenant, not just the caller's assigned outlet(s).
 *  Kept as ONE list so the outlet switcher (header.tsx) and the outlet drill-down filter
 *  (outlet-filter.tsx) never drift out of sync with each other. Mirrors pos-api's
 *  internal/posrole canonicalization. */
const ADMIN_LEVEL_ROLES = [
  'admin', 'superuser', 'manager', 'store_manager', 'outlet_manager', 'supervisor',
  'owner', 'tenant_admin', 'system_admin', 'pos_admin', 'super_admin', 'administrator',
];

/** The outlets a manager is limited to, from the outlet_ids claim of their token (SSO or PIN). Empty
 *  means no limit. Only shapes the picker: pos-api enforces the limit from the verified token. */
export function tokenOutletLimit(accessToken: string | null | undefined): string[] {
  try {
    const payload = accessToken?.split('.')[1];
    if (!payload) return [];
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return Array.isArray(claims.outlet_ids) ? claims.outlet_ids : [];
  } catch {
    return [];
  }
}

/** Whether this user can see/switch across every outlet in the tenant (the outlet switcher and
 *  the sales/report outlet filters), regardless of how they authenticated (SSO or terminal PIN). */
export function canAccessAllOutlets(user: Pick<UserProfile, 'isPlatformOwner' | 'isSuperUser' | 'roles'> | null | undefined): boolean {
  return !!(
    user?.isPlatformOwner ||
    user?.isSuperUser ||
    user?.roles?.some((r) => ADMIN_LEVEL_ROLES.includes(r.toLowerCase()))
  );
}
