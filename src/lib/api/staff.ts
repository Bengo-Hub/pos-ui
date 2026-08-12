import { apiClient } from './client';

export interface StaffMember {
  id: string;
  user_id: string;
  outlet_id: string;
  name: string;
  role: string;
  employment_type: string;
  is_active: boolean;
  has_pin: boolean;
  hourly_rate?: number;
  daily_rate?: number;
  monthly_salary?: number;
  mpesa_phone?: string;
  created_at: string;
}

export interface StaffProfile {
  user_id: string;
  name: string;
  role: string;
  tenant_id: string;
  outlet_id: string;
  has_pin: boolean;
}

export interface CreateStaffInput {
  /**
   * Required. Every staff member is provisioned in auth-service first (S2S) and linked
   * to the real auth user id — no more local PIN-only accounts with invented ids.
   */
  email: string;
  /** Optional override when the auth user id is already known; normally resolved by email. */
  user_id?: string;
  outlet_id: string;
  name: string;
  role: string;
  phone?: string;
  employment_type?: string;
  /** Optional 4-6 digit terminal PIN; lets the new member clock in without an SSO login. */
  pin?: string;
  hourly_rate?: number;
  daily_rate?: number;
  monthly_salary?: number;
  mpesa_phone?: string;
}

export interface UpdateStaffInput {
  name?: string;
  role?: string;
  outlet_id?: string;
  employment_type?: string;
  is_active?: boolean;
  hourly_rate?: number;
  daily_rate?: number;
  monthly_salary?: number;
  mpesa_phone?: string;
}

function staffBase(tenantId: string) {
  return `/api/v1/${tenantId}/pos`;
}

export const staffApi = {
  list: (tenantId: string, outletId?: string) => {
    const params = outletId ? `?outlet_id=${outletId}` : '';
    return apiClient.get<{ data: StaffProfile[] }>(`${staffBase(tenantId)}/staff${params}`);
  },

  listAdmin: (tenantId: string, search?: string) =>
    apiClient.get<{ data: StaffMember[]; total: number }>(`${staffBase(tenantId)}/staff/admin`, search ? { search } : undefined),

  create: (tenantId: string, input: CreateStaffInput) =>
    apiClient.post<{ id: string; name: string }>(`${staffBase(tenantId)}/staff`, input),

  update: (tenantId: string, staffId: string, input: UpdateStaffInput) =>
    apiClient.patch<void>(`${staffBase(tenantId)}/staff/${staffId}`, input),

  deactivate: (tenantId: string, staffId: string) =>
    apiClient.post<void>(`${staffBase(tenantId)}/staff/${staffId}/deactivate`, {}),

  profiles: (tenantId: string, outletId?: string) => {
    const params = outletId ? `?outlet_id=${outletId}` : '';
    return apiClient.get<{ data: StaffProfile[] }>(`${staffBase(tenantId)}/auth/pin/profile${params}`);
  },

  setPin: (tenantId: string, userId: string, pin: string) =>
    apiClient.post<{ message: string }>(`${staffBase(tenantId)}/auth/pin/set`, { user_id: userId, pin }),

  verifyPin: (tenantId: string, userId: string, pin: string) =>
    apiClient.post<{ token: string }>(`${staffBase(tenantId)}/auth/pin`, { user_id: userId, pin }),

  // Mint the signed manager-card token embedded in a staff member's printable QR card.
  cardToken: (tenantId: string, userId: string) =>
    apiClient.post<{ card_token: string; staff_name: string; staff_role: string; can_approve: boolean }>(
      `${staffBase(tenantId)}/staff/${userId}/card-token`, {}),
};
