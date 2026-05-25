import { apiClient } from './client';

export interface StaffMember {
  id: string;
  user_id: string;
  tenant_id: string;
  name: string;
  email?: string;
  role: string;
  is_active: boolean;
  has_pin: boolean;
}

function staffBase(tenantId: string) {
  return `/api/v1/${tenantId}/pos`;
}

export const staffApi = {
  list: (tenantId: string, outletId?: string) => {
    const params = outletId ? `?outlet_id=${outletId}` : '';
    return apiClient.get<StaffMember[]>(`${staffBase(tenantId)}/staff${params}`);
  },

  setPin: (tenantId: string, userId: string, pin: string) =>
    apiClient.post<{ message: string }>(`${staffBase(tenantId)}/auth/pin/set`, {
      user_id: userId,
      pin,
    }),
};
