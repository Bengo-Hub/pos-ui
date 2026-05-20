import { apiClient } from '@/lib/api/client';

const base = (tenantSlug: string) => `/api/v1/${tenantSlug}/pos`;

export interface StaffScheduleEntry {
  id: string;
  tenant_id: string;
  outlet_id: string;
  staff_member_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  notes?: string;
}

export interface UpsertScheduleEntry {
  outlet_id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available?: boolean;
  notes?: string;
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function getStaffSchedule(tenantSlug: string, staffId: string) {
  return apiClient.get<StaffScheduleEntry[]>(`${base(tenantSlug)}/staff/${staffId}/schedule`);
}

export function upsertStaffSchedule(tenantSlug: string, staffId: string, entries: UpsertScheduleEntry[]) {
  return apiClient.put<StaffScheduleEntry[]>(`${base(tenantSlug)}/staff/${staffId}/schedule`, entries);
}
