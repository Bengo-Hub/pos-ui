'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, Loader2, Pencil, Plus, QrCode, ShieldPlus, Store, Trash2, Users, X } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useStaffAdmin, useDeactivateStaff, useUpdateStaff, useSetStaffPIN, useCreateStaff,
} from '@/hooks/useStaff';
import { usePermissions } from '@/hooks/usePermissions';
import { useRbacRoles } from '@/hooks/useRbac';
import { useAuthStore } from '@/store/auth';
import { fetchOutlets } from '@/lib/api/outlets';
import { isPlatformOwner as checkIsPlatformOwner } from '@/lib/auth/permissions';
import { purgeUserAccount } from '@/lib/auth/admin-actions';
import { SearchableCombobox } from '@bengo-hub/shared-ui-lib/combobox';
import type { StaffMember, UpdateStaffInput, CreateStaffInput } from '@/lib/api/staff';
import { StaffShiftDrawer } from '@/components/pos/staff-shift-drawer';
import { RolesPanel } from './RolesPanel';
import { StaffCardModal } from './StaffCardModal';
import { ExtraRolesModal } from './ExtraRolesModal';
import { toast } from 'sonner';
import { inputClass } from './shared';
import { apiErrorMessage } from '@/lib/api/error-message';

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${checked ? 'bg-primary' : 'bg-muted'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

// Fallback display labels for the built-in system roles. The authoritative role list now
// comes from the backend (useRbacRoles) so CUSTOM roles created in the Roles & Permissions
// panel are assignable here too; this map only prettifies the well-known codes.
const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', cashier: 'Cashier', waiter: 'Waiter',
  kitchen: 'Kitchen', bar: 'Bar', receptionist: 'Reception',
  pharmacist: 'Pharmacist', stylist: 'Stylist', therapist: 'Therapist', technician: 'Technician',
};

// Privileged roles a manager may not assign (mirrors the pos-api guardrail).
const PROTECTED_ROLE_CODES = new Set(['admin', 'manager']);

function roleLabel(code: string, name?: string): string {
  return ROLE_LABELS[code] ?? name ?? code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const EMP_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full Time', part_time: 'Part Time', casual: 'Casual', contractor: 'Contractor',
};

export function TeamTab() {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';
  const roles = user?.roles ?? [];

  const { data, isLoading } = useStaffAdmin(tenantId);
  const members: StaffMember[] = data?.data ?? [];

  const deactivate = useDeactivateStaff(tenantId);
  const update = useUpdateStaff(tenantId);
  const setPin = useSetStaffPIN(tenantId);
  const create = useCreateStaff(tenantId);
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.session?.accessToken);
  const isPlatformOwner = checkIsPlatformOwner(user);

  const { canManageStaff, isSuperuser } = usePermissions();
  // A manager is guardrailed: cannot manage admin/manager-level staff. Anyone who ALSO holds
  // an admin-tier role (or is a platform owner/superuser) is not restricted.
  const isAdminLevel = isSuperuser || roles.some((r) => ['admin', 'owner', 'superuser', 'super_admin'].includes(r));
  const isManager = !isAdminLevel && roles.includes('manager');

  // Authoritative role list from the backend so custom roles are assignable. Managers can't
  // assign the privileged admin/manager roles (server-enforced too).
  const { data: rbacRoles = [] } = useRbacRoles(tenantId);
  const roleOptions = rbacRoles
    .map((r) => ({ value: r.role_code, label: roleLabel(r.role_code, r.name), isSystem: r.is_system_role }))
    .filter((o) => !(isManager && PROTECTED_ROLE_CODES.has(o.value)))
    .sort((a, b) => a.label.localeCompare(b.label));
  // Fallback to the built-in labels when the backend role list hasn't loaded yet.
  const effectiveRoleOptions = roleOptions.length > 0
    ? roleOptions
    : Object.entries(ROLE_LABELS)
        .filter(([v]) => !(isManager && PROTECTED_ROLE_CODES.has(v)))
        .map(([value, label]) => ({ value, label, isSystem: true }));
  const selectedOutletId = useAuthStore((s) => s.selectedOutletId);
  const outlet = useAuthStore((s) => s.outlet);
  const outletId = selectedOutletId || outlet?.id || '';

  // Full outlet list — lets an admin/manager see AND switch which outlet a team member is
  // assigned to. Shares the ['outlet_list', tenantId] cache key with OutletFilter (no duplicate
  // fetch when both are mounted, e.g. the header switcher alongside this settings tab).
  const { data: outlets = [] } = useQuery({
    queryKey: ['outlet_list', tenantId],
    queryFn: () => fetchOutlets(tenantId),
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  });
  const outletName = (id?: string) => {
    if (!id) return '—';
    return outlets.find((o) => o.id === id)?.name ?? `${id.slice(0, 8)}…`;
  };

  const [view, setView] = useState<'members' | 'roles'>('members');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '', email: '', role: 'cashier', employment_type: 'full_time', pin: '', mpesa_phone: '',
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UpdateStaffInput>({});
  const [pinStaffId, setPinStaffId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [scheduleStaff, setScheduleStaff] = useState<StaffMember | null>(null);
  const [cardStaff, setCardStaff] = useState<StaffMember | null>(null);
  const [extraRolesStaff, setExtraRolesStaff] = useState<StaffMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  function startEdit(m: StaffMember) {
    setEditingId(m.id);
    setEditForm({ name: m.name, role: m.role, outlet_id: m.outlet_id, employment_type: m.employment_type, mpesa_phone: m.mpesa_phone });
  }

  async function saveEdit(m: StaffMember) {
    try {
      await update.mutateAsync({ staffId: m.id, input: editForm });
      toast.success('Staff updated');
      setEditingId(null);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to update staff'));
    }
  }

  async function toggleActive(m: StaffMember, nextActive: boolean) {
    // The "off" direction still goes through the dedicated deactivate endpoint (it's the
    // one the backend actually treats as "sign this person out everywhere"); "on" reuses
    // the generic update endpoint's existing is_active field, previously never invoked
    // from this page.
    try {
      if (nextActive) {
        await update.mutateAsync({ staffId: m.id, input: { is_active: true } });
        toast.success('Staff activated');
      } else {
        await deactivate.mutateAsync(m.id);
        toast.success('Staff deactivated');
      }
    } catch (e) {
      toast.error(await apiErrorMessage(e, nextActive ? 'Failed to activate staff' : 'Failed to deactivate staff'));
    }
  }

  async function confirmHardDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await purgeUserAccount(accessToken, deleteTarget.user_id);
      toast.success('Staff member permanently deleted');
      setDeleteTarget(null);
      // The purge cascades back to pos-api via the auth.user.deleted event; refresh once
      // that's had a moment to land rather than optimistically removing the row.
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['staff-admin', tenantId] }), 1500);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to delete staff member'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddMember() {
    if (!addForm.name.trim()) { toast.error('Name is required'); return; }
    const email = addForm.email.trim().toLowerCase();
    if (!email || !email.includes('@')) { toast.error('A valid email is required — the member is created in SSO'); return; }
    if (!outletId) { toast.error('Select an outlet before adding staff'); return; }
    if (addForm.pin && addForm.pin.length < 4) { toast.error('PIN must be at least 4 digits'); return; }
    try {
      // pos-api provisions the user in auth-service by email (S2S) and links the real
      // auth user id — no orphan ids.
      const input: CreateStaffInput = {
        email,
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
      setAddForm({ name: '', email: '', role: 'cashier', employment_type: 'full_time', pin: '', mpesa_phone: '' });
    } catch (err) {
      toast.error(await apiErrorMessage(err, 'Failed to add team member'));
    }
  }

  async function handleSetPin(userId: string) {
    if (newPin.length < 4) { toast.error('PIN must be at least 4 digits'); return; }
    try {
      await setPin.mutateAsync({ userId, pin: newPin });
      toast.success('PIN updated');
      setPinStaffId(null);
      setNewPin('');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to set PIN'));
    }
  }

  return (
    <div className="space-y-4">
      {/* Members | Roles & Permissions sub-view toggle */}
      <div className="flex gap-1 bg-accent/10 p-1 rounded-lg w-fit">
        <button
          onClick={() => setView('members')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${view === 'members' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Members
        </button>
        <button
          onClick={() => setView('roles')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${view === 'roles' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Roles & Permissions
        </button>
      </div>

      {view === 'roles' && <RolesPanel />}

      {view === 'members' && (
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
                    <th className="text-left px-4 py-3">Outlet</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-center px-4 py-3">PIN</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {members.map((m) => {
                    const isEditing = editingId === m.id;
                    const isProtected = PROTECTED_ROLE_CODES.has(m.role) && isManager;
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
                                {effectiveRoleOptions.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            )
                            : <span className="text-xs">{roleLabel(m.role)}</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          {isEditing
                            ? (
                              <SearchableCombobox
                                options={
                                  outlets.length === 0
                                    ? [{ value: m.outlet_id, label: outletName(m.outlet_id) }]
                                    : outlets.map((o) => ({ value: o.id, label: o.name }))
                                }
                                value={editForm.outlet_id ?? m.outlet_id}
                                onChange={(value) => setEditForm((f) => ({ ...f, outlet_id: value }))}
                              />
                            )
                            : (
                              <span className="text-xs flex items-center gap-1.5">
                                <Store className="h-3 w-3 text-muted-foreground shrink-0" />
                                {outletName(m.outlet_id)}
                              </span>
                            )
                          }
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {EMP_TYPE_LABELS[m.employment_type] ?? m.employment_type}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              m.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                            }`}>
                              {m.is_active ? 'Active' : 'Inactive'}
                            </span>
                            {canManageStaff && !isProtected && (
                              <Toggle
                                checked={m.is_active}
                                disabled={update.isPending || deactivate.isPending}
                                onChange={(v) => toggleActive(m, v)}
                              />
                            )}
                          </div>
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
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                                  onClick={() => setCardStaff(m)}
                                  title="Print approval QR card"
                                >
                                  <QrCode className="h-3.5 w-3.5" />
                                </Button>
                                {!isProtected && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                                    onClick={() => setExtraRolesStaff(m)}
                                    title="Extra roles (e.g. make a waiter a super waiter)"
                                  >
                                    <ShieldPlus className="h-3.5 w-3.5" />
                                  </Button>
                                )}
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
                                {isPlatformOwner && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                    onClick={() => setDeleteTarget(m)}
                                    title="Permanently delete this staff member (platform admin only)"
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
      )}

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
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email *</label>
                <input
                  type="email"
                  className={inputClass}
                  value={addForm.email}
                  onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="name@example.com"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">Creates the member&apos;s SSO account and links their real user id.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Role</label>
                  <select
                    className={inputClass}
                    value={addForm.role}
                    onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
                  >
                    {/* Authoritative role list incl. custom roles; managers can't pick admin/manager. */}
                    {effectiveRoleOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
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
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v && !deleting) setDeleteTarget(null); }}
        title="Permanently delete this staff member?"
        description={`This deletes ${deleteTarget?.name ?? 'this person'}'s account everywhere on the platform — every tenant, every service. This cannot be undone. If you only want to remove their access here, use the Active/Inactive toggle instead.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete permanently'}
        onConfirm={confirmHardDelete}
        variant="danger"
        loading={deleting}
      />

      <StaffShiftDrawer
        staff={scheduleStaff}
        open={!!scheduleStaff}
        onClose={() => setScheduleStaff(null)}
      />

      <StaffCardModal
        staff={cardStaff}
        open={!!cardStaff}
        onClose={() => setCardStaff(null)}
      />

      <ExtraRolesModal
        staff={extraRolesStaff}
        open={!!extraRolesStaff}
        onClose={() => setExtraRolesStaff(null)}
        tenantId={tenantId}
        roleLabel={roleLabel}
        protectedRoleCodes={PROTECTED_ROLE_CODES}
        canAssignProtected={isAdminLevel}
      />
    </div>
  );
}
