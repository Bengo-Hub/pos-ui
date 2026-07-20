'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Lock, Pencil, Plus, Save, Search, Shield, Trash2, X } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuthStore } from '@/store/auth';
import {
  useCreateRole, useDeleteRole, useRbacPermissions, useRbacRoles, useRolePermissions,
  useSetRolePermissions, useUpdateRole,
} from '@/hooks/useRbac';
import type { POSPermission, POSRole } from '@/lib/api/rbac';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { inputClass } from './shared';

const ACTION_LABELS: Record<string, string> = {
  view: 'View', view_own: 'View own', add: 'Create', change: 'Edit', change_own: 'Edit own',
  delete: 'Delete', delete_own: 'Delete own', manage: 'Manage', manage_own: 'Manage own',
  void: 'Void', view_cost: 'View cost',
};

const actionLabel = (a: string) => ACTION_LABELS[a] ?? a.replace(/_/g, ' ');

/**
 * RolesPanel lets admins/managers create POS roles and manage each role's permission
 * matrix (grouped by module). Guardrailed per the RBAC policy:
 *  - Managers may create/edit/delete CUSTOM roles and edit their permission matrices.
 *  - Only ADMIN-level users may edit SYSTEM roles (admin, manager, cashier, …). For a
 *    manager the system-role matrix renders read-only (the backend enforces this too).
 */
export function RolesPanel() {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';
  const { canManageStaff, isSuperuser } = usePermissions();
  const roles = user?.roles ?? [];
  const isAdminLevel = isSuperuser || roles.some((r) => ['admin', 'owner', 'superuser', 'super_admin'].includes(r));

  const { data: roleList = [], isLoading } = useRbacRoles(tenantId);
  const createRole = useCreateRole(tenantId);
  const updateRole = useUpdateRole(tenantId);
  const deleteRole = useDeleteRole(tenantId);

  const [selected, setSelected] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ role_code: '', name: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<POSRole | null>(null);

  useEffect(() => {
    if (!selected && roleList.length) setSelected(roleList[0].id);
  }, [roleList, selected]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const selectedRole = roleList.find((r) => r.id === selected) ?? null;
  // A system role's matrix is editable only by an admin-level user.
  const canEditMatrix = canManageStaff && (!selectedRole?.is_system_role || isAdminLevel);

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Roles</span>
            {canManageStaff && (
              <Button size="sm" className="h-7 px-2" onClick={() => setShowNew((s) => !s)} title="Add custom role">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-2 space-y-1">
          {showNew && (
            <div className="p-2 space-y-2 bg-accent/5 rounded-lg mb-2">
              <input className={inputClass} placeholder="Code (e.g. floor_supervisor)" value={form.role_code}
                onChange={(e) => setForm({ ...form, role_code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
              <input className={inputClass} placeholder="Display name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Button size="sm" className="w-full" disabled={!form.role_code || !form.name || createRole.isPending}
                onClick={() => createRole.mutate(form, {
                  onSuccess: () => { toast.success('Role created'); setForm({ role_code: '', name: '' }); setShowNew(false); },
                  onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to create role')),
                })}>
                {createRole.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create role'}
              </Button>
            </div>
          )}
          {roleList.map((r) => {
            const isEditing = editingId === r.id;
            return (
              <div key={r.id}
                className={`w-full flex items-center gap-1 p-1.5 rounded-lg text-sm ${selected === r.id ? 'bg-primary/10' : 'hover:bg-accent/10'}`}>
                {isEditing ? (
                  <>
                    <input className={`${inputClass} h-7 py-1`} value={editName} autoFocus
                      onChange={(e) => setEditName(e.target.value)} />
                    <button className="text-green-600 shrink-0 p-1" title="Save"
                      onClick={() => updateRole.mutate({ roleId: r.id, name: editName }, {
                        onSuccess: () => { toast.success('Role updated'); setEditingId(null); },
                        onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to update role')),
                      })}>
                      {updateRole.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    </button>
                    <button className="text-muted-foreground shrink-0 p-1" title="Cancel" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setSelected(r.id)}
                      className={`flex-1 flex items-center justify-between gap-2 text-left ${selected === r.id ? 'text-primary font-semibold' : ''}`}>
                      <span className="truncate">{r.name}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        {r.use_cases && r.use_cases.length > 0 && (
                          <span className="text-[10px] text-primary/70" title={`Only shown for: ${r.use_cases.join(', ')}`}>
                            {r.use_cases.join(', ')}
                          </span>
                        )}
                        {r.is_system_role && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Lock className="h-2.5 w-2.5" /> system</span>
                        )}
                      </span>
                    </button>
                    {/* Custom roles are editable/deletable; system roles are protected. */}
                    {canManageStaff && !r.is_system_role && (
                      <>
                        <button className="text-muted-foreground hover:text-primary shrink-0 p-1" title="Rename role"
                          onClick={() => { setEditingId(r.id); setEditName(r.name); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button className="text-muted-foreground hover:text-destructive shrink-0 p-1" title="Delete role"
                          onClick={() => setConfirmDelete(r)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {roleList.length === 0 && <p className="text-xs text-muted-foreground p-2">No roles defined.</p>}
        </CardContent>
      </Card>

      {selected && (
        <RolePermissionMatrix
          key={selected}
          tenantId={tenantId}
          role={selectedRole}
          canManage={canEditMatrix}
          onRoleChanged={setSelected}
          readOnlyReason={selectedRole?.is_system_role && !isAdminLevel
            ? 'System roles can only be edited by an administrator.'
            : undefined}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}
        title={`Delete role "${confirmDelete?.name ?? ''}"`}
        description="This removes the role and unassigns it from any staff. This cannot be undone."
        confirmLabel="Delete role"
        variant="danger"
        loading={deleteRole.isPending}
        onConfirm={() => confirmDelete && deleteRole.mutate(confirmDelete.id, {
          onSuccess: () => {
            toast.success('Role deleted');
            if (selected === confirmDelete.id) setSelected(null);
            setConfirmDelete(null);
          },
          onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to delete role')),
        })}
      />
    </div>
  );
}

function RolePermissionMatrix({
  tenantId, role, canManage, readOnlyReason, onRoleChanged,
}: { tenantId: string; role: POSRole | null; canManage: boolean; readOnlyReason?: string; onRoleChanged?: (roleId: string) => void }) {
  const roleId = role?.id ?? '';
  const { data: allPerms = [], isLoading: pl } = useRbacPermissions(tenantId);
  const { data: rolePerms = [], isLoading: rl } = useRolePermissions(tenantId, roleId || null);
  const setRolePerms = useSetRolePermissions(tenantId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  useEffect(() => {
    setSelected(new Set(rolePerms.map((p) => p.id)));
  }, [rolePerms]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const g: Record<string, POSPermission[]> = {};
    for (const p of allPerms) {
      if (q && !(`${p.module} ${p.action} ${p.name} ${p.permission_code}`.toLowerCase().includes(q))) continue;
      (g[p.module] ??= []).push(p);
    }
    return g;
  }, [allPerms, query]);

  if (pl || rl) {
    return <Card><CardContent className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></CardContent></Card>;
  }

  const toggle = (id: string) => {
    if (!canManage) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const moduleAllOn = (mod: string) => grouped[mod].every((p) => selected.has(p.id));
  const toggleModule = (mod: string) => {
    if (!canManage) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = grouped[mod].every((p) => next.has(p.id));
      for (const p of grouped[mod]) allOn ? next.delete(p.id) : next.add(p.id);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="font-bold text-sm">Permission matrix</span>
            {role && <span className="ml-2 text-xs text-muted-foreground">· {role.name} ({selected.size} granted)</span>}
            {readOnlyReason && (
              <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-0.5"><Lock className="h-3 w-3" /> {readOnlyReason}</p>
            )}
          </div>
          {canManage && (
            <Button size="sm" disabled={setRolePerms.isPending}
              onClick={() => setRolePerms.mutate({ roleId, permissionIds: Array.from(selected) }, {
                onSuccess: (effectiveRoleId) => {
                  // A shared/global role edit is copy-on-written into a per-tenant override with a
                  // new id — re-point the selection at it so the matrix keeps showing this role.
                  const wasSystem = role?.is_system_role;
                  if (effectiveRoleId && effectiveRoleId !== roleId) onRoleChanged?.(effectiveRoleId);
                  toast.success(wasSystem && effectiveRoleId !== roleId
                    ? 'Permissions saved for this business (other businesses unaffected)'
                    : 'Permissions updated');
                },
                onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to update permissions')),
              })}>
              {setRolePerms.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-3.5 w-3.5 mr-1" /> Save</>}
            </Button>
          )}
        </div>
        <div className="relative mt-2">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className={`${inputClass} pl-8`} placeholder="Search permissions…" value={query}
            onChange={(e) => setQuery(e.target.value)} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 max-h-[55vh] overflow-y-auto">
        {Object.keys(grouped).sort().map((mod) => (
          <div key={mod}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-primary">{mod.replace(/_/g, ' ')}</p>
              {canManage && (
                <button type="button" onClick={() => toggleModule(mod)}
                  className="text-[10px] text-muted-foreground hover:text-primary">
                  {moduleAllOn(mod) ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {grouped[mod].map((p) => {
                const on = selected.has(p.id);
                return (
                  <button key={p.id} type="button" disabled={!canManage} onClick={() => toggle(p.id)}
                    className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-left text-sm ${on ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'} ${canManage ? '' : 'opacity-60 cursor-not-allowed'}`}
                    title={p.permission_code}>
                    <span className="truncate">{p.name || actionLabel(p.action)}</span>
                    <span className={`h-4 w-4 rounded-full shrink-0 ${on ? 'bg-primary' : 'bg-muted'}`} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {Object.keys(grouped).length === 0 && <p className="text-sm text-muted-foreground">No permissions match your search.</p>}
      </CardContent>
    </Card>
  );
}
