import { apiClient } from './client';

export type OverrideType = 'off_duty' | 'manual_shift' | 'half_day';
export type OverrideStatus = 'pending' | 'approved' | 'rejected';

export interface ShiftOverride {
  id: string;
  tenant_id: string;
  outlet_id?: string;
  staff_member_id: string;
  date: string;
  override_type: OverrideType;
  start_time?: string;
  end_time?: string;
  reason?: string;
  status: OverrideStatus;
  created_by: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOverrideInput {
  date: string;           // YYYY-MM-DD
  override_type: OverrideType;
  start_time?: string;    // HH:MM — required for manual_shift / half_day
  end_time?: string;
  reason?: string;
}

function overrideBase(tenantID: string) {
  return `/api/v1/${tenantID}/pos`;
}

export const shiftOverridesApi = {
  /** All staff overrides for a date range (planner view) */
  listAll: (tenantID: string, from: string, to: string) =>
    apiClient.get<ShiftOverride[]>(`${overrideBase(tenantID)}/staff/overrides`, { from, to }),

  /** Overrides for a specific staff member */
  listForStaff: (tenantID: string, staffId: string, from: string, to: string) =>
    apiClient.get<ShiftOverride[]>(`${overrideBase(tenantID)}/staff/${staffId}/overrides`, { from, to }),

  create: (tenantID: string, staffId: string, body: CreateOverrideInput) =>
    apiClient.post<ShiftOverride>(`${overrideBase(tenantID)}/staff/${staffId}/overrides`, body),

  delete: (tenantID: string, staffId: string, overrideId: string) =>
    apiClient.delete(`${overrideBase(tenantID)}/staff/${staffId}/overrides/${overrideId}`),
};
