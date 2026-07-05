'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  BadgeCheck, ChefHat, ChevronDown, EyeOff, FlaskConical, Loader2, Lock,
  ShoppingCart, UtensilsCrossed, Wrench,
} from 'lucide-react';
import { usePOSSettings, useUpdatePOSModules, useUpdateOutletConfig } from '@/hooks/usePOSSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { useRbacRoles } from '@/hooks/useRbac';
import { P } from '@/lib/rbac/permissions';
import { useAuthStore } from '@/store/auth';
import { buildNavGroups, CORE_MODULE_KEYS, type NavItem } from '@/lib/pos/nav-config';
import type { UpdatePOSModulesInput } from '@/lib/api/settings';
import { Toggle } from './shared';

// Backend feature flags that some sidebar modules ALSO drive (not just visibility). Toggling such a
// module writes both the disabled_modules list (visibility) and the functional flag, so hiding a
// module the outlet doesn't use also stops its background processing.
type BackendFlagKey = 'hotel_module_enabled' | 'enable_kds' | 'enable_appointments' | 'layaway_enabled';
const BACKEND_FLAG: Record<string, BackendFlagKey> = {
  hotel: 'hotel_module_enabled',
  kds: 'enable_kds',
  appointments: 'enable_appointments',
  layaway: 'layaway_enabled',
};

// Friendly module names for the visibility tree (falls back to a title-cased key).
const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', cash_drawer: 'Cash Drawer', clients: 'Clients', shifts: 'Shifts',
  new_order: 'Point of Sale', orders: 'Sales & Orders', layaway: 'Layaway', returns: 'Returns',
  tables: 'Tables', reservations: 'Reservations', appointments: 'Appointments', packages: 'Service Packages',
  queue: 'Walk-in Queue', repairs: 'Repairs', staff_schedule: 'Staff Schedule', resources: 'Resources',
  kds: 'Kitchen Display (KDS)', hotel: 'Hotel / Rooms', online_orders: 'Online Orders',
  pharmacy: 'Pharmacy', patients: 'Patients', purchase_orders: 'Purchase Orders', inventory: 'Inventory',
  accounting: 'Accounting', crm: 'CRM & Marketing', reports: 'Reports & Analytics',
  loyalty: 'Loyalty', commissions: 'Commissions', settings: 'Settings',
};

const USE_CASES = [
  { id: 'hospitality', label: 'Hospitality', icon: UtensilsCrossed, description: 'Restaurants, cafes, hotels — tables, kitchen display, room billing.' },
  { id: 'retail', label: 'Retail', icon: ShoppingCart, description: 'Supermarkets, hardware, fashion — barcode scanning and inventory.' },
  { id: 'services', label: 'Services', icon: Wrench, description: 'Salons, spas, repair shops — appointments, clients, scheduling.' },
  { id: 'quick_service', label: 'Quick Service', icon: ChefHat, description: 'Fast-food, food courts, kiosks — simple order flow + KDS.' },
  { id: 'pharmacy', label: 'Pharmacy', icon: FlaskConical, description: 'Dispensaries — drug inventory, prescriptions, patients.' },
];

function titleize(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ModuleNode {
  key: string;
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}

export function ModulesTab() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) ?? '';
  const { data: settings, isLoading } = usePOSSettings();
  const updateModules = useUpdatePOSModules();
  const updateOutletConfig = useUpdateOutletConfig();
  const { can } = usePermissions();
  const { useCase: resolvedUseCase, enabledModules, isSuperUser } = useModuleAccess();
  const setOutlet = useAuthStore((s) => s.setOutlet);
  const outlet = useAuthStore((s) => s.outlet);
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? '');
  const { data: roles = [] } = useRbacRoles(tenantId);
  const canEdit = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE) || isSuperUser;

  const [activeUC, setActiveUC] = useState<string>(resolvedUseCase ?? 'hospitality');
  // Hiding SCOPE: '' = All roles (the flat tenant-wide lists); a role_code = hide additionally for
  // that role only. Platform-owner/superuser users always see everything regardless of these hides.
  const [scopeRole, setScopeRole] = useState<string>('');
  const [flatDisabled, setFlatDisabled] = useState<Set<string>>(new Set());
  const [flatHidden, setFlatHidden] = useState<Set<string>>(new Set());
  const [byRoleDisabled, setByRoleDisabled] = useState<Record<string, string[]>>({});
  const [byRoleHidden, setByRoleHidden] = useState<Record<string, string[]>>({});
  const [flags, setFlags] = useState<Record<BackendFlagKey, boolean>>({
    hotel_module_enabled: false, enable_kds: false, enable_appointments: false, layaway_enabled: false,
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [assigningUC, setAssigningUC] = useState(false);

  useEffect(() => { if (resolvedUseCase) setActiveUC(resolvedUseCase); }, [resolvedUseCase]);

  useEffect(() => {
    if (settings) {
      setFlatDisabled(new Set(settings.disabled_modules ?? []));
      setFlatHidden(new Set(settings.hidden_items ?? []));
      setByRoleDisabled(settings.disabled_modules_by_role ?? {});
      setByRoleHidden(settings.hidden_items_by_role ?? {});
      setFlags({
        hotel_module_enabled: settings.hotel_module_enabled ?? false,
        enable_kds: settings.enable_kds ?? false,
        enable_appointments: settings.enable_appointments ?? false,
        layaway_enabled: settings.layaway_enabled ?? false,
      });
    }
  }, [settings]);

  // The sets shown/edited for the ACTIVE scope: the flat lists for "All roles", else that role's
  // bucket. Toggles below write back to whichever scope is selected.
  const disabled = scopeRole ? new Set(byRoleDisabled[scopeRole] ?? []) : flatDisabled;
  const hidden = scopeRole ? new Set(byRoleHidden[scopeRole] ?? []) : flatHidden;

  // Modules available to THIS outlet's use case, in sidebar order, each with its child items — the
  // exact set the sidebar renders (minus profile-inapplicable items), built from the shared nav config.
  const modules: ModuleNode[] = useMemo(() => {
    const items = buildNavGroups(orgSlug).flatMap((g) => g.items);
    const order: string[] = [];
    const byModule = new Map<string, NavItem[]>();
    const enabled = enabledModules as string[];
    for (const it of items) {
      if (!enabled.includes(it.moduleKey)) continue;
      if (resolvedUseCase && it.hideForProfiles?.includes(resolvedUseCase)) continue;
      if (!byModule.has(it.moduleKey)) { byModule.set(it.moduleKey, []); order.push(it.moduleKey); }
      byModule.get(it.moduleKey)!.push(it);
    }
    return order.map((key) => ({
      key,
      label: MODULE_LABELS[key] ?? titleize(key),
      icon: byModule.get(key)![0].icon,
      items: byModule.get(key)!,
    }));
  }, [orgSlug, enabledModules, resolvedUseCase]);

  const moduleOn = (key: string): boolean => {
    if (disabled.has(key)) return false;
    const flag = BACKEND_FLAG[key];
    return flag ? flags[flag] : true;
  };

  const toggleModule = async (key: string, on: boolean) => {
    if (CORE_MODULE_KEYS.has(key)) return;
    const nextDisabled = new Set(disabled);
    if (on) nextDisabled.delete(key); else nextDisabled.add(key);
    let patch: UpdatePOSModulesInput;
    if (scopeRole) {
      // Per-role hide: write only this role's bucket. The functional backend flag is tenant-wide, so
      // per-role hides never touch it (they only change sidebar visibility for that role).
      const prev = byRoleDisabled;
      const nextByRole = { ...byRoleDisabled, [scopeRole]: [...nextDisabled] };
      setByRoleDisabled(nextByRole);
      patch = { disabled_modules_by_role: nextByRole };
      setSaving(key);
      try { await updateModules.mutateAsync(patch); }
      catch { setByRoleDisabled(prev); }
      finally { setSaving(null); }
      return;
    }
    setFlatDisabled(nextDisabled);
    patch = { disabled_modules: [...nextDisabled] };
    const flag = BACKEND_FLAG[key];
    if (flag) { setFlags((f) => ({ ...f, [flag]: on })); patch[flag] = on; }
    setSaving(key);
    try { await updateModules.mutateAsync(patch); }
    catch {
      // revert on failure
      setFlatDisabled(flatDisabled);
      if (flag) setFlags((f) => ({ ...f, [flag]: !on }));
    } finally { setSaving(null); }
  };

  const toggleItem = async (href: string, visible: boolean) => {
    const nextHidden = new Set(hidden);
    if (visible) nextHidden.delete(href); else nextHidden.add(href);
    setSaving(href);
    if (scopeRole) {
      const prev = byRoleHidden;
      const nextByRole = { ...byRoleHidden, [scopeRole]: [...nextHidden] };
      setByRoleHidden(nextByRole);
      try { await updateModules.mutateAsync({ hidden_items_by_role: nextByRole }); }
      catch { setByRoleHidden(prev); }
      finally { setSaving(null); }
      return;
    }
    setFlatHidden(nextHidden);
    try { await updateModules.mutateAsync({ hidden_items: [...nextHidden] }); }
    catch { setFlatHidden(flatHidden); }
    finally { setSaving(null); }
  };

  const assignUseCase = async (ucId: string) => {
    setAssigningUC(true);
    try {
      await updateOutletConfig.mutateAsync({ use_case: ucId });
      setActiveUC(ucId);
      if (outlet) setOutlet({ ...outlet, use_case: ucId });
    } finally { setAssigningUC(false); }
  };

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const activeUCDef = USE_CASES.find((u) => u.id === activeUC) ?? USE_CASES[0];
  const showTree = activeUC === resolvedUseCase && modules.length > 0;

  return (
    <div className="space-y-5">
      {!canEdit && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 text-amber-800 dark:text-amber-300 text-sm">
          <Lock className="h-4 w-4 shrink-0" />
          Module configuration requires admin or manager permissions.
        </div>
      )}

      {/* Use-case selector */}
      <div className="flex gap-1 p-1 rounded-2xl bg-muted/50 border border-border overflow-x-auto scrollbar-hide">
        {USE_CASES.map((uc) => {
          const Icon = uc.icon;
          const active = activeUC === uc.id;
          const isCurrent = resolvedUseCase === uc.id;
          return (
            <button
              key={uc.id}
              type="button"
              onClick={() => setActiveUC(uc.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all
                ${active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {uc.label}
              {isCurrent && <BadgeCheck className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          );
        })}
      </div>

      <div className="flex items-start justify-between gap-4 px-1">
        <div>
          <p className="text-sm font-semibold">{activeUCDef.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{activeUCDef.description}</p>
        </div>
        {canEdit && resolvedUseCase !== activeUCDef.id && (
          <button
            type="button"
            disabled={assigningUC}
            onClick={() => assignUseCase(activeUCDef.id)}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-60"
          >
            {assigningUC ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {resolvedUseCase ? 'Switch to this use case' : 'Set use case'}
          </button>
        )}
        {resolvedUseCase === activeUCDef.id && (
          <span className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-semibold">
            <BadgeCheck className="h-3.5 w-3.5" /> Active use case
          </span>
        )}
      </div>

      {/* Hiding scope: all roles (tenant-wide) or a specific role */}
      {showTree && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Hide for</label>
          <select
            value={scopeRole}
            onChange={(e) => setScopeRole(e.target.value)}
            disabled={!canEdit}
            className="bg-card border border-border rounded-xl py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          >
            <option value="">All roles (everyone)</option>
            {roles.map((r) => (
              <option key={r.id} value={r.role_code}>{r.name}</option>
            ))}
          </select>
          <span className="text-[11px] text-muted-foreground">
            {scopeRole
              ? 'Hides the toggled screens for this role only (in addition to any all-roles hides).'
              : 'Hides for every non-admin user. Platform owners always see everything.'}
          </span>
        </div>
      )}

      {/* Module & screen visibility tree */}
      {showTree ? (
        <div className="space-y-3">
          <div className="px-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Modules & Screens</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Turn a module off to hide it and all its screens from the sidebar — keep only what this
              outlet uses (e.g. a guest house can keep just Hotel). Expand a module to hide individual screens.
            </p>
          </div>
          <div className="space-y-2">
            {modules.map((mod) => (
              <ModuleRow
                key={mod.key}
                mod={mod}
                on={moduleOn(mod.key)}
                core={CORE_MODULE_KEYS.has(mod.key)}
                canEdit={canEdit}
                saving={saving}
                hidden={hidden}
                onToggleModule={toggleModule}
                onToggleItem={toggleItem}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl border border-dashed border-primary/40 bg-primary/5 text-sm">
          {!resolvedUseCase ? (
            <>
              <p className="font-semibold text-primary mb-1">Outlet type not configured</p>
              <p className="text-xs text-muted-foreground">Select a use case above to activate the matching modules for this outlet.</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Switch to <span className="font-semibold text-foreground">{USE_CASES.find((u) => u.id === resolvedUseCase)?.label}</span> (this outlet&apos;s active use case) to manage its module visibility.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ModuleRow({
  mod, on, core, canEdit, saving, hidden, onToggleModule, onToggleItem,
}: {
  mod: ModuleNode;
  on: boolean;
  core: boolean;
  canEdit: boolean;
  saving: string | null;
  hidden: Set<string>;
  onToggleModule: (key: string, on: boolean) => void;
  onToggleItem: (href: string, visible: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = mod.icon;
  const hasChildren = mod.items.length > 1;

  return (
    <div className={`rounded-2xl border transition-colors ${on ? 'border-border bg-card' : 'border-border bg-muted/30'}`}>
      <div className="flex items-center gap-3 p-4">
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
          {saving === mod.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold">{mod.label}</p>
            {core && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground"><Lock className="h-3 w-3" /> Required</span>}
            {!on && !core && <span className="text-[10px] font-semibold text-muted-foreground">Hidden</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasChildren ? `${mod.items.length} screens` : mod.items[0]?.label}
          </p>
        </div>
        {hasChildren && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/40"
            aria-label="Expand screens"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
        {core ? (
          <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <Toggle checked={on} onChange={(v) => onToggleModule(mod.key, v)} disabled={!canEdit || saving === mod.key} />
        )}
      </div>

      {hasChildren && expanded && (
        <div className="border-t border-border px-4 py-2 space-y-1">
          {mod.items.map((it) => {
            const visible = on && !hidden.has(it.href);
            return (
              <div key={it.href} className="flex items-center gap-3 py-1.5">
                <it.icon className={`h-4 w-4 shrink-0 ${visible ? 'text-foreground' : 'text-muted-foreground/50'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${visible ? '' : 'text-muted-foreground line-through'}`}>{it.label}</p>
                </div>
                {!on ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><EyeOff className="h-3 w-3" /> module off</span>
                ) : (
                  <Toggle
                    checked={!hidden.has(it.href)}
                    onChange={(v) => onToggleItem(it.href, v)}
                    disabled={!canEdit || saving === it.href}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
