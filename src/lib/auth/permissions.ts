import type { Permission, UserProfile, UserRole } from "./types";

type Operator = "and" | "or";

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
