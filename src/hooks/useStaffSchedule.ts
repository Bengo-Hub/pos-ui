'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

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

export function useStaffSchedule(staffId: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['staff-schedule', tenantID, staffId],
    queryFn: () =>
      apiClient
        .get<StaffScheduleEntry[] | { data: StaffScheduleEntry[] }>(
          `/api/v1/${tenantID}/pos/staff/${staffId}/schedule`,
        )
        .then((res): StaffScheduleEntry[] =>
          Array.isArray(res) ? res : ((res as { data: StaffScheduleEntry[] }).data ?? []),
        ),
    enabled: !!tenantID && !!staffId,
    staleTime: 60_000,
  });
}

export function useUpsertStaffSchedule(staffId: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entries: UpsertScheduleEntry[]) =>
      apiClient.put<StaffScheduleEntry[]>(
        `/api/v1/${tenantID}/pos/staff/${staffId}/schedule`,
        entries,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-schedule', tenantID, staffId] }),
  });
}
