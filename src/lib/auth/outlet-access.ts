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

/** Whether this user can see/switch across every outlet in the tenant (the outlet switcher and
 *  the sales/report outlet filters), regardless of how they authenticated (SSO or terminal PIN). */
export function canAccessAllOutlets(user: Pick<UserProfile, 'isPlatformOwner' | 'isSuperUser' | 'roles'> | null | undefined): boolean {
  return !!(
    user?.isPlatformOwner ||
    user?.isSuperUser ||
    user?.roles?.some((r) => ADMIN_LEVEL_ROLES.includes(r.toLowerCase()))
  );
}
