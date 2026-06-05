import type { Permission, UserProfile, UserRole } from "./types";

type Operator = "and" | "or";

/**
 * isPlatformOwner — single source of truth for "is this the SaaS platform operator".
 *
 * Platform pages (device fleet, platform config, licensing) are owner-only. A tenant
 * `admin` is NOT a platform owner — only the `is_platform_owner` claim, the `superuser`
 * role, or membership in the codevertex tenant qualifies. Codevertex membership is
 * verified via the SERVER-returned tenant slug (`tenant_slug`/`tenantSlug` on the
 * profile), never the URL `orgSlug`, so navigating to `/codevertex/...` does not grant
 * platform access to an unrelated tenant admin.
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
  const slug = user.tenant_slug ?? user.tenantSlug ?? "";
  return (
    user.isPlatformOwner === true ||
    user.isSuperUser === true ||
    (user.roles?.includes("superuser") ?? false) ||
    slug === "codevertex"
  );
}

export function userHasRole(
  user: UserProfile | null,
  roles?: UserRole[] | null,
  operator: Operator = "or",
): boolean {
  if (!roles?.length) return true;
  if (!user) return false;
  // Superuser bypasses all role checks
  if (user.isSuperUser || user.roles.includes("superuser")) return true;
  const matches = roles.map((role) => user.roles.includes(role));
  return operator === "and" ? matches.every(Boolean) : matches.some(Boolean);
}

export function userHasPermission(
  user: UserProfile | null,
  permissions?: Permission[] | null,
  operator: Operator = "or",
): boolean {
  if (!permissions?.length) return true;
  if (!user) return false;
  // Superuser bypasses all permission checks
  if (user.isSuperUser || user.roles.includes("superuser")) return true;
  const matches = permissions.map((permission) => user.permissions.includes(permission));
  return operator === "and" ? matches.every(Boolean) : matches.some(Boolean);
}

export function userCanAccess(
  user: UserProfile | null,
  options: {
    roles?: UserRole[] | null;
    permissions?: Permission[] | null;
    roleOperator?: Operator;
    permissionOperator?: Operator;
  } = {},
): boolean {
  const { roles, permissions, roleOperator = "or", permissionOperator = "or" } = options;
  return (
    userHasRole(user, roles, roleOperator) &&
    userHasPermission(user, permissions, permissionOperator)
  );
}
