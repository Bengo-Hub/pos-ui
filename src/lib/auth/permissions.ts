/**
 * isPlatformOwner — single source of truth for "is this the SaaS platform operator".
 *
 * Platform pages (device fleet, platform config, licensing) are owner-only. A tenant
 * `admin` is NOT a platform owner — only the `is_platform_owner` claim or the `superuser`
 * role qualifies. The tenant slug (and the URL `orgSlug`) grant nothing.
 *
 * Accepts both the auth-store user shape (`tenant_slug`) and the typed UserProfile
 * (`tenantSlug`).
 */
export function isPlatformOwner(
  user:
    | {
        isPlatformOwner?: boolean;
        isSuperUser?: boolean;
        roles?: string[];
        tenant_slug?: string;
        tenantSlug?: string;
      }
    | null
    | undefined,
): boolean {
  if (!user) return false;
  // The tenant slug grants no platform powers; only the claim or the superuser role does.
  return (
    user.isPlatformOwner === true ||
    user.isSuperUser === true ||
    (user.roles?.includes("superuser") ?? false)
  );
}

