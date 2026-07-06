/**
 * Shared POS role constants — mirrors pos-api's override-role list (handlers/step_up.go
 * adminOverrideRoles). Roles here self-approve sensitive actions (voids, held-item write-offs)
 * without a separate manager step-up.
 */
export const VOID_SELF_ROLES = [
  'admin', 'manager', 'pos_admin', 'store_manager', 'owner', 'super_admin', 'superuser',
];

/** True when any of the user's roles can self-approve void-class actions. */
export function canSelfApproveVoid(roles: string[] | undefined | null): boolean {
  return (roles ?? []).some((r) => VOID_SELF_ROLES.includes(r));
}
