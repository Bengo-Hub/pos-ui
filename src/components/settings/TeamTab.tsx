'use client';

import { useState } from 'react';
import { CalendarDays, Check, Loader2, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useStaffAdmin, useDeactivateStaff, useUpdateStaff, useSetStaffPIN, useCreateStaff,
} from '@/hooks/useStaff';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth';
import type { StaffMember, UpdateStaffInput, CreateStaffInput } from '@/lib/api/staff';
import { StaffShiftDrawer } from '@/components/pos/staff-shift-drawer';
import { toast } from 'sonner';
import { inputClass } from './shared';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', cashier: 'Cashier', waiter: 'Waiter',
  kitchen: 'Kitchen', bar: 'Bar', receptionist: 'Reception',
  pharmacist: 'Pharmacist', stylist: 'Stylist', therapist: 'Therapist', technician: 'Technician',
};

const EMP_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full Time', part_time: 'Part Time', casual: 'Casual', contractor: 'Contractor',
};

export function TeamTab() {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';
  const requesterRole = user?.roles?.[0] ?? '';

  const { data, isLoading } = useStaffAdmin(tenantId);
  const members: StaffMember[] = data?.data ?? [];

  const deactivate = useDeactivateStaff(tenantId);
  const update = useUpdateStaff(tenantId);
  const setPin = useSetStaffPIN(tenantId);
  const create = useCreateStaff(tenantId);

  const { canManageStaff } = usePermissions();
  const isManager = requesterRole === 'manager';
  const selectedOutletId = useAuthStore((s) => s.selectedOutletId);
  const outlet = useAuthStore((s) => s.outlet);
  const outletId = selectedOutletId || outlet?.id || '';

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '', role: 'cashier', employment_type: 'full_time', pin: '', mpesa_phone: '',
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UpdateStaffInput>({});
  const [pinStaffId, setPinStaffId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [scheduleStaff, setScheduleStaff] = useState<StaffMember | null>(null);

  function startEdit(m: StaffMember) {
    setEditingId(m.id);
    setEditForm({ name: m.name, role: m.role, employment_type: m.employment_type, mpesa_phone: m.mpesa_phone });
  }

  async function saveEdit(m: StaffMember) {
    try {
      await update.mutateAsync({ staffId: m.id, input: editForm });
      toast.success('Staff updated');
      setEditingId(null);
    } catch {
      toast.error('Failed to update staff');
    }
  }

  async function confirmDeactivate(staffId: string) {
    try {
      await deactivate.mutateAsync(staffId);
      toast.success('Staff deactivated');
      setConfirmId(null);
    } catch {
      toast.error('Failed to deactivate staff');
    }
  }

  async function handleAddMember() {
    if (!addForm.name.trim()) { toast.error('Name is required'); return; }
    if (!outletId) { toast.error('Select an outlet before adding staff'); return; }
    if (addForm.pin && addForm.pin.length < 4) { toast.error('PIN must be at least 4 digits'); return; }
    try {
      // No user_id → pos-api creates a local PIN-only staff member (terminal login only).
      const input: CreateStaffInput = {
        name: addForm.name.trim(),
        role: addForm.role,
        outlet_id: outletId,
        employment_type: addForm.employment_type,
        pin: addForm.pin || undefined,
        mpesa_phone: addForm.mpesa_phone.trim() || undefined,
      };
      await create.mutateAsync(input);
      toast.success('Team member added');
      setShowAdd(false);
      setAddForm({ name: '', role: 'cashier', employment_type: 'full_time', pin: '', mpesa_phone: '' });
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Failed to add team member');
    }
  }

  async function handleSetPin(userId: string) {
    if (newPin.length < 4) { toast.error('PIN must be at least 4 digits'); return; }
    try {
      await setPin.mutateAsync({ userId, pin: newPin });
      toast.success('PIN updated');
      setPinStaffId(null);
      setNewPin('');
    } catch {
      toast.error('Failed to set PIN');
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="font-bold text-sm">Team Members</span>
              {data && <span className="text-xs text-muted-foreground">({data.total})</span>}
            </div>
            {canManageStaff && (
              <Button size="sm" className="h-8 px-3 text-xs" onClick={() => setShowAdd(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add team member
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-10">No staff members found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-accent/5 text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Role</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-center px-4 py-3">PIN</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {members.map((m) => {
                    const isEditing = editingId === m.id;
                    const isProtected =
                      (m.role === 'admin' || m.role === 'manager') && requesterRole === 'manager';
                    return (
                      <tr key={m.id} className="hover:bg-accent/5 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          {isEditing
                            ? <input
                                className={inputClass}
                                value={editForm.name ?? ''}
                                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                              />
                            : m.name}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing && !isProtected
                            ? (
                              <select
                                className={inputClass}
                                value={editForm.role ?? m.role}
                                onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                              >
                                {Object.entries(ROLE_LABELS).map(([v, l]) => (
                                  <option key={v} value={v}>{l}</option>
                                ))}
                              </select>
                            )
                            : <span className="text-xs">{ROLE_LABELS[m.role] ?? m.role}</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {EMP_TYPE_LABELS[m.employment_type] ?? m.employment_type}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            m.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                          }`}>
                            {m.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {pinStaffId === m.id ? (
                            <div className="flex items-center gap-1 justify-center">
                              <input
                                type="password"
                                placeholder="4+ digits"
                                maxLength={6}
                                value={newPin}
                                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                                className="w-24 bg-accent/10 border border-border rounded-md py-1 px-2 text-sm text-center"
                              />
                              <button
                                onClick={() => handleSetPin(m.user_id)}
                                disabled={setPin.isPending}
                                className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                              >
                                {setPin.isPending ? '…' : 'Set'}
                              </button>
                              <button
                                onClick={() => { setPinStaffId(null); setNewPin(''); }}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setPinStaffId(m.id)}
                              className="text-xs text-primary hover:underline"
                            >
                              {m.has_pin ? 'Reset PIN' : 'Set PIN'}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            {isEditing ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => saveEdit(m)}
                                  disabled={update.isPending}
                                >
                                  {update.isPending
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Check className="h-3.5 w-3.5 text-green-600" />}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setEditingId(null)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                                  onClick={() => setScheduleStaff(m)}
                                  title="Manage shift schedule"
                                >
                                  <CalendarDays className="h-3.5 w-3.5" />
                                </Button>
                                {!isProtected && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() => startEdit(m)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {m.is_active && !isProtected && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                    onClick={() => setConfirmId(m.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <div className="relative z-50 w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Add Team Member
              </h3>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <input
                  className={inputClass}
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Role</label>
                  <select
                    className={inputClass}
                    value={addForm.role}
                    onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
                  >
                    {Object.entries(ROLE_LABELS)
                      // Managers cannot create admin/manager-level staff (also enforced server-side).
                      .filter(([v]) => !(isManager && (v === 'admin' || v === 'manager')))
                      .map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Employment</label>
                  <select
                    className={inputClass}
                    value={addForm.employment_type}
                    onChange={(e) => setAddForm((f) => ({ ...f, employment_type: e.target.value }))}
                  >
                    {Object.entries(EMP_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Terminal PIN</label>
                  <input
                    type="password"
                    maxLength={6}
                    className={inputClass}
                    value={addForm.pin}
                    onChange={(e) => setAddForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))}
                    placeholder="4-6 digits (optional)"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">M-Pesa phone</label>
                  <input
                    className={inputClass}
                    value={addForm.mpesa_phone}
                    onChange={(e) => setAddForm((f) => ({ ...f, mpesa_phone: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Creates a local POS staff member who clocks in with the PIN on a terminal. No SSO login is created.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAddMember} disabled={create.isPending}>
                {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add member'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmId}
        onOpenChange={(v) => { if (!v) setConfirmId(null); }}
        title="Deactivate Staff Member"
        description="This staff member will no longer be able to log in. You can reactivate them later."
        confirmLabel="Deactivate"
        onConfirm={() => confirmId && confirmDeactivate(confirmId)}
        variant="danger"
        loading={deactivate.isPending}
      />

      <StaffShiftDrawer
        staff={scheduleStaff}
        open={!!scheduleStaff}
        onClose={() => setScheduleStaff(null)}
      />
    </div>
  );
}
