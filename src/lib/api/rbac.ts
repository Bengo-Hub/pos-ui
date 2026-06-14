import { apiClient } from './client';

export interface POSRole {
  id: string;
  role_code: string;
  name: string;
  description?: string;
  is_system_role: boolean;
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

const base = (tenantId: string) => `/api/v1/${tenantId}`;

export const rbacApi = {
  listRoles: (tenantId: string) =>
    apiClient.get<{ roles: POSRole[] }>(`${base(tenantId)}/rbac/roles`).then((r) => r.roles ?? []),

  listPermissions: (tenantId: string) =>
    apiClient
      .get<{ permissions: POSPermission[] }>(`${base(tenantId)}/rbac/permissions`)
      .then((r) => r.permissions ?? []),

  createRole: (tenantId: string, input: CreatePOSRoleInput) =>
    apiClient.post<POSRole>(`${base(tenantId)}/rbac/roles`, input),

  getRolePermissions: (tenantId: string, roleId: string) =>
    apiClient
      .get<{ data?: POSPermission[]; permissions?: POSPermission[] }>(`${base(tenantId)}/rbac/roles/${roleId}/permissions`)
      .then((r) => r.data ?? r.permissions ?? []),

  setRolePermissions: (tenantId: string, roleId: string, permissionIds: string[]) =>
    apiClient.put<void>(`${base(tenantId)}/rbac/roles/${roleId}/permissions`, { permission_ids: permissionIds }),

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
};
