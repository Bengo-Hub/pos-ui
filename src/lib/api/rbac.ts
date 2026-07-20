import { apiClient } from './client';

export interface POSRole {
  id: string;
  role_code: string;
  name: string;
  description?: string;
  is_system_role: boolean;
  /** Outlet use case(s) this role applies to; empty/absent = common (every use case). */
  use_cases?: string[];
}

export interface POSPermission {
  id: string;
  permission_code: string;
  name: string;
  module: string;
  action: string;
  resource?: string;
}

export interface CreatePOSRoleInput {
  role_code: string;
  name: string;
  description?: string;
}

export interface StepUpResult {
  approval_token: string;
  approver_name: string;
  expires_in: number;
}

/** An additive per-user role grant (POSUserRoleAssignment) — a user keeps their base role AND
 *  gains this role's permissions. Used to elevate e.g. a waiter to a "super waiter" (floor
 *  supervisor: see + settle all bills) without changing their base role. */
export interface RoleAssignment {
  id: string;
  tenant_id: string;
  user_id: string;
  role_id: string;
  assigned_by?: string;
  assigned_at?: string;
}

const base = (tenantId: string) => `/api/v1/${tenantId}`;

export const rbacApi = {
  // useCase (outlet.use_case) scopes the result to roles/permissions relevant to that outlet
  // type — a hospitality outlet doesn't need to see pharmacy/retail/services-exclusive roles
  // and vice versa. Omit to get everything (used by e.g. platform-owner tooling).
  listRoles: (tenantId: string, useCase?: string) =>
    apiClient
      .get<{ roles: POSRole[] }>(`${base(tenantId)}/rbac/roles`, useCase ? { use_case: useCase } : undefined)
      .then((r) => r.roles ?? []),

  listPermissions: (tenantId: string, useCase?: string) =>
    apiClient
      .get<{ permissions: POSPermission[] }>(`${base(tenantId)}/rbac/permissions`, useCase ? { use_case: useCase } : undefined)
      .then((r) => r.permissions ?? []),

  createRole: (tenantId: string, input: CreatePOSRoleInput) =>
    apiClient.post<POSRole>(`${base(tenantId)}/rbac/roles`, input),

  updateRole: (tenantId: string, roleId: string, input: { name?: string; description?: string }) =>
    apiClient.patch<void>(`${base(tenantId)}/rbac/roles/${roleId}`, input),

  deleteRole: (tenantId: string, roleId: string) =>
    apiClient.delete<void>(`${base(tenantId)}/rbac/roles/${roleId}`),

  getRolePermissions: (tenantId: string, roleId: string) =>
    apiClient
      .get<{ data?: POSPermission[]; permissions?: POSPermission[] }>(`${base(tenantId)}/rbac/roles/${roleId}/permissions`)
      .then((r) => r.data ?? r.permissions ?? []),

  // Returns the EFFECTIVE role id the edit was applied to. When roleId is a shared/global system
  // role, the server copy-on-writes a per-tenant override (so the edit never leaks to other tenants)
  // and returns that override's id — the caller should re-target the matrix at it.
  setRolePermissions: (tenantId: string, roleId: string, permissionIds: string[]) =>
    apiClient
      .put<{ message?: string; role_id?: string }>(`${base(tenantId)}/rbac/roles/${roleId}/permissions`, { permission_ids: permissionIds })
      .then((r) => r?.role_id ?? roleId),

  // ── Additive per-user role assignments (POSUserRoleAssignment) ──────────────
  // A staff member keeps their base role (StaffMember.Role) AND gains every assigned role's
  // permissions (unioned server-side in resolveEffectivePermissions). This is how a manager
  // elevates ONE waiter to a "super waiter" without editing the shared waiter role.
  listAssignments: (tenantId: string) =>
    apiClient
      .get<{ assignments: RoleAssignment[] }>(`${base(tenantId)}/rbac/assignments`)
      .then((r) => r.assignments ?? []),

  assignRole: (tenantId: string, userId: string, roleId: string) =>
    apiClient.post<{ message: string }>(`${base(tenantId)}/rbac/assignments`, { user_id: userId, role_id: roleId }),

  revokeAssignment: (tenantId: string, assignmentId: string) =>
    apiClient.delete<{ message: string }>(`${base(tenantId)}/rbac/assignments/${assignmentId}`),

  // Manager-PIN step-up: returns a short-lived single-action approval token.
  stepUp: (tenantId: string, action: string, pin: string, outletId: string) =>
    apiClient.post<StepUpResult>(`${base(tenantId)}/pos/auth/pin/step-up`, {
      action,
      pin,
      outlet_id: outletId,
    }),

  // Manager-card step-up: scan a manager's QR staff card (no PIN typing).
  stepUpCard: (tenantId: string, action: string, cardToken: string, outletId: string) =>
    apiClient.post<StepUpResult>(`${base(tenantId)}/pos/auth/pin/step-up-card`, {
      action,
      card_token: cardToken,
      outlet_id: outletId,
    }),

  // Manager generates a one-time, non-order-scoped approval CODE for a pre-order action
  // (over-limit discount / price override / order adjustment / out-of-stock override) — the same
  // OTP mechanism as void/complimentary codes, shared with a cashier who enters it in the Code tab.
  generateApprovalCode: (tenantId: string, action: string, outletId: string, ttlMinutes?: number) =>
    apiClient.post<{ code: string; action: string; expires_at: string; expires_in: number; approver_name?: string }>(
      `${base(tenantId)}/pos/approval-codes`,
      { action, outlet_id: outletId, ...(ttlMinutes ? { ttl_minutes: ttlMinutes } : {}) },
    ),

  // Redeem (consume) a manager approval code for a client-side gate (out-of-stock override).
  verifyApprovalCode: (tenantId: string, action: string, code: string, outletId: string) =>
    apiClient.post<{ approved: boolean; approver_user_id: string }>(
      `${base(tenantId)}/pos/approval-codes/verify`,
      { action, code, outlet_id: outletId },
    ),
};
