'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, Shield } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { useAuthStore } from '@/store/auth';
import { useCreateRole, useRbacPermissions, useRbacRoles, useRolePermissions, useSetRolePermissions } from '@/hooks/useRbac';
import type { POSPermission } from '@/lib/api/rbac';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';
import { inputClass } from './shared';

/**
 * RolesPanel lets admins create POS roles and manage each role's permission
 * matrix (grouped by module). Rendered inside the Team tab.
 */
export function RolesPanel() {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';
  const { canManageStaff } = usePermissions();

  const { data: roles = [], isLoading } = useRbacRoles(tenantId);
  const createRole = useCreateRole(tenantId);
  const [selected, setSelected] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ role_code: '', name: '' });

  useEffect(() => {
    if (!selected && roles.length) setSelected(roles[0].id);
  }, [roles, selected]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Roles</span>
            {canManageStaff && (
              <Button size="sm" className="h-7 px-2" onClick={() => setShowNew((s) => !s)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-2 space-y-1">
          {showNew && (
            <div className="p-2 space-y-2 bg-accent/5 rounded-lg mb-2">
              <input className={inputClass} placeholder="Code (e.g. floor_supervisor)" value={form.role_code}
                onChange={(e) => setForm({ ...form, role_code: e.target.value })} />
              <input className={inputClass} placeholder="Display name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Button size="sm" className="w-full" disabled={!form.role_code || !form.name || createRole.isPending}
                onClick={() => createRole.mutate(form, {
                  onSuccess: () => { toast.success('Role created'); setForm({ role_code: '', name: '' }); setShowNew(false); },
                  onError: () => toast.error('Failed to create role'),
                })}>
                {createRole.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create role'}
              </Button>
            </div>
          )}
          {roles.map((r) => (
            <button key={r.id} onClick={() => setSelected(r.id)}
              className={`w-full flex items-center justify-between gap-2 p-2 rounded-lg text-left text-sm ${selected === r.id ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-accent/10'}`}>
              <span className="truncate">{r.name}</span>
              {r.is_system_role && <span className="text-[10px] text-muted-foreground">system</span>}
            </button>
          ))}
          {roles.length === 0 && <p className="text-xs text-muted-foreground p-2">No roles defined.</p>}
        </CardContent>
      </Card>

      {selected && <RolePermissionMatrix tenantId={tenantId} roleId={selected} canManage={canManageStaff} />}
    </div>
  );
}

function RolePermissionMatrix({ tenantId, roleId, canManage }: { tenantId: string; roleId: string; canManage: boolean }) {
  const { data: allPerms = [], isLoading: pl } = useRbacPermissions(tenantId);
  const { data: rolePerms = [], isLoading: rl } = useRolePermissions(tenantId, roleId);
  const setRolePerms = useSetRolePermissions(tenantId);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set(rolePerms.map((p) => p.id)));
  }, [rolePerms]);

  const grouped = useMemo(() => {
    const g: Record<string, POSPermission[]> = {};
    for (const p of allPerms) (g[p.module] ??= []).push(p);
    return g;
  }, [allPerms]);

  if (pl || rl) {
    return <Card><CardContent className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></CardContent></Card>;
  }

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm">Permission matrix</span>
          {canManage && (
            <Button size="sm" disabled={setRolePerms.isPending}
              onClick={() => setRolePerms.mutate({ roleId, permissionIds: Array.from(selected) }, {
                onSuccess: () => toast.success('Permissions updated'),
                onError: () => toast.error('Failed to update permissions'),
              })}>
              {setRolePerms.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-3.5 w-3.5 mr-1" /> Save</>}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 max-h-[55vh] overflow-y-auto">
        {Object.keys(grouped).sort().map((mod) => (
          <div key={mod}>
            <p className="text-xs font-bold uppercase tracking-wider text-primary mb-1.5">{mod.replace(/_/g, ' ')}</p>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {grouped[mod].map((p) => {
                const on = selected.has(p.id);
                return (
                  <button key={p.id} type="button" disabled={!canManage} onClick={() => toggle(p.id)}
                    className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-left text-sm ${on ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'} ${canManage ? '' : 'opacity-60'}`}
                    title={p.permission_code}>
                    <span className="truncate">{p.action}</span>
                    <span className={`h-4 w-4 rounded-full shrink-0 ${on ? 'bg-primary' : 'bg-muted'}`} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {allPerms.length === 0 && <p className="text-sm text-muted-foreground">No permissions found.</p>}
      </CardContent>
    </Card>
  );
}
