"use client";

import type { ReactNode } from "react";

import { userCanAccess } from "@/lib/auth/permissions";
import type { Permission, UserRole } from "@/lib/auth/types";
import { useAuthStore } from "@/store/auth";

interface AuthorizationGateProps {
  roles?: UserRole[];
  permissions?: Permission[];
  roleOperator?: "and" | "or";
  permissionOperator?: "and" | "or";
  fallback?: ReactNode;
  children: ReactNode;
}

export function AuthorizationGate({
  roles,
  permissions,
  roleOperator,
  permissionOperator,
  fallback = null,
  children,
}: AuthorizationGateProps) {
  const user = useAuthStore((state) => state.user);

  const accessOptions: Parameters<typeof userCanAccess>[1] = {};
  if (roles !== undefined) accessOptions.roles = roles ?? null;
  if (permissions !== undefined) accessOptions.permissions = permissions ?? null;
  if (roleOperator) accessOptions.roleOperator = roleOperator;
  if (permissionOperator) accessOptions.permissionOperator = permissionOperator;

  const canAccess = userCanAccess(user as Parameters<typeof userCanAccess>[0], accessOptions);

  if (!canAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
