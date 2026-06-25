'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, XCircle, Loader2, CalendarCheck } from 'lucide-react';
import { useLeaveRequests, useUpdateLeaveStatus } from '@/hooks/useLeaveRequests';
import { useStaffAdmin } from '@/hooks/useStaff';
import { useAuthStore } from '@/store/auth';
import { Card, CardContent } from '@/components/ui/base';
import { apiErrorMessage } from '@/lib/api/error-message';
import { toast } from 'sonner';
import type { LeaveRequest, LeaveStatus } from '@/lib/api/leave-requests';

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: 'Annual Leave', sick: 'Sick Leave', unpaid: 'Unpaid Leave',
  maternity: 'Maternity', compassionate: 'Compassionate', other: 'Other',
};

const STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function LeaveCard({
  leave, staffName, onApprove, onReject, isUpdating,
}: {
  leave: LeaveRequest;
  staffName: string;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  isUpdating: boolean;
}) {
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');

  const from = new Date(leave.start_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
  const to = new Date(leave.end_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">{staffName}</p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASSES[leave.status] ?? ''}`}>
                {leave.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {LEAVE_TYPE_LABELS[leave.leave_type] ?? leave.leave_type} · {from} – {to}
            </p>
            {leave.reason && (
              <p className="text-xs text-muted-foreground mt-1 italic">"{leave.reason}"</p>
            )}
            {leave.rejection_reason && (
              <p className="text-xs text-red-600 mt-1">Reason: {leave.rejection_reason}</p>
            )}
          </div>
          {leave.status === 'pending' && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => onApprove(leave.id)}
                disabled={isUpdating}
                className="flex items-center gap-1 text-xs text-green-700 bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Approve
              </button>
              <button
                onClick={() => setShowReject((p) => !p)}
                disabled={isUpdating}
                className="flex items-center gap-1 text-xs text-red-700 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </button>
            </div>
          )}
        </div>
        {showReject && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Rejection reason (optional)"
              className="flex-1 text-xs px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => { onReject(leave.id, reason); setShowReject(false); setReason(''); }}
              disabled={isUpdating}
              className="text-xs text-red-700 bg-red-100 hover:bg-red-200 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => { setShowReject(false); setReason(''); }}
              className="text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LeaveApprovalPanel() {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | undefined>('pending');

  const { data: leaves = [], isLoading } = useLeaveRequests(statusFilter);
  const { data: staffData } = useStaffAdmin(tenantId);
  const updateStatus = useUpdateLeaveStatus();

  const staffNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of staffData?.data ?? []) { m[s.id] = s.name; }
    return m;
  }, [staffData]);

  async function handleApprove(leaveId: string) {
    try {
      await updateStatus.mutateAsync({ leaveId, status: 'approved' });
      toast.success('Leave approved');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to approve leave'));
    }
  }

  async function handleReject(leaveId: string, rejectionReason: string) {
    try {
      await updateStatus.mutateAsync({ leaveId, status: 'rejected', rejectionReason });
      toast.success('Leave rejected');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to reject leave'));
    }
  }

  const filterOptions: { value: LeaveStatus | undefined; label: string }[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: undefined, label: 'All' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
        {filterOptions.map(({ value, label }) => (
          <button
            key={String(value)}
            onClick={() => setStatusFilter(value)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : leaves.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CalendarCheck className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {statusFilter === 'pending' ? 'No pending leave requests' : 'No leave requests'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Staff can submit leave requests from their shift drawer
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaves.map((lv) => (
            <LeaveCard
              key={lv.id}
              leave={lv}
              staffName={staffNames[lv.staff_member_id] ?? `Staff ${lv.staff_member_id.slice(0, 8)}`}
              onApprove={handleApprove}
              onReject={handleReject}
              isUpdating={updateStatus.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
