"use client";

import type { ReactNode } from "react";
import { useAuthStore } from "@/store/auth";
import { userHasPermission } from "@/lib/auth/permissions";
import type { Permission } from "@/lib/auth/types";

export interface PermissionActionButtonProps {
  /** Permission code(s) required */
  permission: Permission | Permission[];
  /** Match mode: 'any' (default) requires at least one, 'all' requires every permission */
  match?: "any" | "all";
  /** Click handler */
  onClick: () => void;
  /** Hide completely when unauthorized (default: true). If false, shows disabled. */
  hideWhenUnauthorized?: boolean;
  /** Additional condition to show/enable the button */
  condition?: boolean;
  /** Disable the button */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Button content */
  children: ReactNode;
}

export function PermissionActionButton({
  permission,
  match = "any",
  onClick,
  hideWhenUnauthorized = true,
  condition = true,
  disabled = false,
  className,
  children,
}: PermissionActionButtonProps) {
  const user = useAuthStore((state) => state.user);

  const permissions = Array.isArray(permission) ? permission : [permission];
  const operator = match === "all" ? "and" : "or";
  const hasPermission = userHasPermission(
    user as Parameters<typeof userHasPermission>[0],
    permissions,
    operator,
  );

  if (!condition) return null;
  if (!hasPermission && hideWhenUnauthorized) return null;

  return (
    <button
      onClick={onClick}
      disabled={disabled || !hasPermission}
      className={className}
    >
      {children}
    </button>
  );
}
