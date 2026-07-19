'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, ShieldPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/base';
import { rbacApi, type POSRole } from '@/lib/api/rbac';
import type { StaffMember } from '@/lib/api/staff';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { inputClass } from './shared';

/**
 * Additive per-user role assignments ("extra roles"). A staff member keeps their base role and
 * ALSO gains every extra role's permissions (unioned server-side). This is how a manager elevates
 * ONE waiter to a "super waiter" (assign `floor_supervisor`: see + settle all bills) without
 * editing the shared waiter role or converting them to a cashier.
 */
export function ExtraRolesModal({
  staff,
  open,
  onClose,
  tenantId,
  roleLabel,
  protectedRoleCodes,
  canAssignProtected,
}: {
  staff: StaffMember | null;
  open: boolean;
  onClose: () => void;
  tenantId: string;
  roleLabel: (code: string, name?: string) => string;
  protectedRoleCodes: Set<string>;
  canAssignProtected: boolean;
}) {
  const qc = useQueryClient();
  const [addRoleId, setAddRoleId] = useState('');

  const rolesQ = useQuery({
    queryKey: ['rbac-roles', tenantId],
    queryFn: () => rbacApi.listRoles(tenantId),
    enabled: open && !!tenantId,
  });
  const assignmentsQ = useQuery({
    queryKey: ['rbac-assignments', tenantId],
    queryFn: () => rbacApi.listAssignments(tenantId),
    enabled: open && !!tenantId,
  });

  const roleById = useMemo(
    () => Object.fromEntries((rolesQ.data ?? []).map((r) => [r.id, r] as const)),
    [rolesQ.data],
  );

  // This member's current additive assignments (excludes their base role, which isn't an assignment).
  const myAssignments = useMemo(
    () => (assignmentsQ.data ?? []).filter((a) => staff && a.user_id === staff.user_id),
    [assignmentsQ.data, staff],
  );
  const assignedRoleIds = useMemo(() => new Set(myAssignments.map((a) => a.role_id)), [myAssignments]);

  // Roles selectable as EXTRA: not the base role, not already assigned, and (for managers) not a
  // protected admin/manager role. The backend enforces the protected-role guardrail too.
  const options = useMemo(() => {
    return (rolesQ.data ?? []).filter((r: POSRole) => {
      if (staff && r.role_code === staff.role) return false;
      if (assignedRoleIds.has(r.id)) return false;
      if (!canAssignProtected && protectedRoleCodes.has(r.role_code)) return false;
      return true;
    });
  }, [rolesQ.data, staff, assignedRoleIds, canAssignProtected, protectedRoleCodes]);

  const assign = useMutation({
    mutationFn: (roleId: string) => rbacApi.assignRole(tenantId, staff!.user_id, roleId),
    onSuccess: () => {
      setAddRoleId('');
      void qc.invalidateQueries({ queryKey: ['rbac-assignments', tenantId] });
      toast.success('Extra role added');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to add role')),
  });
  const revoke = useMutation({
    mutationFn: (assignmentId: string) => rbacApi.revokeAssignment(tenantId, assignmentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rbac-assignments', tenantId] });
      toast.success('Extra role removed');
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to remove role')),
  });

  if (!open || !staff) return null;

  const loading = rolesQ.isLoading || assignmentsQ.isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <ShieldPlus className="h-5 w-5 text-primary" /> Extra roles
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {staff.name} — base role <span className="font-medium">{roleLabel(staff.role)}</span>. Extra
              roles ADD their permissions on top (e.g. give a waiter <span className="font-medium">Floor
              Supervisor</span> to see &amp; settle all bills without becoming a cashier).
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            {/* Current extra roles */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assigned extra roles</p>
              {myAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">None — this member has only their base role.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {myAssignments.map((a) => {
                    const role = roleById[a.role_id];
                    return (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium"
                      >
                        {role ? roleLabel(role.role_code, role.name) : a.role_id.slice(0, 8)}
                        <button
                          onClick={() => revoke.mutate(a.id)}
                          disabled={revoke.isPending}
                          className="rounded-full hover:bg-primary/20 p-0.5 disabled:opacity-50"
                          aria-label="Remove role"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Add an extra role */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add an extra role</p>
              <div className="flex gap-2">
                <select
                  value={addRoleId}
                  onChange={(e) => setAddRoleId(e.target.value)}
                  className={inputClass + ' flex-1'}
                >
                  <option value="">Select a role…</option>
                  {options.map((r) => (
                    <option key={r.id} value={r.id}>
                      {roleLabel(r.role_code, r.name)}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={() => addRoleId && assign.mutate(addRoleId)}
                  disabled={!addRoleId || assign.isPending}
                >
                  {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </Button>
              </div>
              {options.length === 0 && (
                <p className="text-xs text-muted-foreground">No more roles available to add.</p>
              )}
            </div>
          </>
        )}

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}
