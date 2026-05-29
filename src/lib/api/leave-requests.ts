import { apiClient } from './client';

export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'maternity' | 'compassionate' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  tenant_id: string;
  outlet_id?: string;
  staff_member_id: string;
  start_date: string;
  end_date: string;
  leave_type: LeaveType;
  reason?: string;
  status: LeaveStatus;
  requested_by: string;
  approved_by?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateLeaveRequestInput {
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  leave_type: LeaveType;
  reason?: string;
}

function leaveBase(tenantID: string) {
  return `/api/v1/${tenantID}/pos`;
}

export const leaveRequestsApi = {
  /** All leave requests for the tenant (manager approval view) */
  list: (tenantID: string, status?: LeaveStatus) =>
    apiClient.get<LeaveRequest[]>(`${leaveBase(tenantID)}/leave-requests`, status ? { status } : {}),

  /** Leave requests for a specific staff member */
  listForStaff: (tenantID: string, staffId: string) =>
    apiClient.get<LeaveRequest[]>(`${leaveBase(tenantID)}/staff/${staffId}/leave-requests`),

  create: (tenantID: string, staffId: string, body: CreateLeaveRequestInput) =>
    apiClient.post<LeaveRequest>(`${leaveBase(tenantID)}/staff/${staffId}/leave-requests`, body),

  updateStatus: (tenantID: string, leaveId: string, status: 'approved' | 'rejected', rejectionReason?: string) =>
    apiClient.patch<LeaveRequest>(`${leaveBase(tenantID)}/leave-requests/${leaveId}/status`, {
      status,
      rejection_reason: rejectionReason,
    }),
};
