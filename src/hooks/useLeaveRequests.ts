'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { leaveRequestsApi, type CreateLeaveRequestInput, type LeaveStatus } from '@/lib/api/leave-requests';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

/** All leave requests for the tenant — manager view */
export function useLeaveRequests(status?: LeaveStatus) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['leave-requests', tenantID, status],
    queryFn: () => leaveRequestsApi.list(tenantID, status),
    enabled: !!tenantID,
    staleTime: 30_000,
  });
}

/** Leave requests for a specific staff member */
export function useStaffLeaveRequests(staffId: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['leave-requests-staff', tenantID, staffId],
    queryFn: () => leaveRequestsApi.listForStaff(tenantID, staffId),
    enabled: !!tenantID && !!staffId,
    staleTime: 30_000,
  });
}

export function useCreateLeaveRequest(staffId: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLeaveRequestInput) => leaveRequestsApi.create(tenantID, staffId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests', tenantID] });
      qc.invalidateQueries({ queryKey: ['leave-requests-staff', tenantID, staffId] });
    },
  });
}

export function useUpdateLeaveStatus() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leaveId, status, rejectionReason }: { leaveId: string; status: 'approved' | 'rejected'; rejectionReason?: string }) =>
      leaveRequestsApi.updateStatus(tenantID, leaveId, status, rejectionReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests', tenantID] });
    },
  });
}
