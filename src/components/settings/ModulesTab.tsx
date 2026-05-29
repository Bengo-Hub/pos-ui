'use client';

import { useEffect, useState } from 'react';
import {
  BadgeCheck, BedDouble, Calendar, ChefHat, Clock,
  FlaskConical, Loader2, Lock, Package, ShoppingCart,
  UtensilsCrossed, Wrench,
} from 'lucide-react';
import { usePOSSettings, useUpdatePOSModules, useUpdateOutletConfig } from '@/hooks/usePOSSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { P } from '@/lib/rbac/permissions';
import { useAuthStore } from '@/store/auth';
import { Toggle } from './shared';

type ModuleToggleKey =
  | 'hotel_module_enabled'
  | 'enable_kds'
  | 'enable_appointments'
  | 'layaway_enabled'
  | 'shift_reports_enabled';

interface FeatureDef {
  key: ModuleToggleKey;
  label: string;
  icon: React.ElementType;
  description: string;
}

interface UseCaseDef {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  configurable: FeatureDef[];
  alwaysOn: string[];
}

const USE_CASE_DEFS: UseCaseDef[] = [
  {
    id: 'hospitality',
    label: 'Hospitality',
    icon: UtensilsCrossed,
    description: 'Restaurants, cafes, hotels — table management, kitchen display, room billing.',
    configurable: [
      { key: 'enable_kds', label: 'Kitchen Display System', icon: ChefHat, description: 'Show orders on kitchen/bar screens; staff bump tickets to mark items ready.' },
      { key: 'hotel_module_enabled', label: 'Hotel / Rooms', icon: BedDouble, description: 'Room management, check-in/check-out, and room billing.' },
      { key: 'enable_appointments', label: 'Appointments', icon: Calendar, description: 'Bookings for services, events, or seated reservations.' },
      { key: 'shift_reports_enabled', label: 'Shift Reports', icon: Clock, description: 'Shift summaries, cash reconciliation, and end-of-day reports.' },
    ],
    alwaysOn: ['Tables & Floor Plan', 'Bar Display (with KDS)', 'Loyalty', 'Commissions', 'Online Orders'],
  },
  {
    id: 'retail',
    label: 'Retail',
    icon: ShoppingCart,
    description: 'General retail — supermarkets, hardware stores, fashion — barcode scanning and inventory.',
    configurable: [
      { key: 'layaway_enabled', label: 'Layaway', icon: Package, description: 'Reserve items with a deposit; customers pay the balance later.' },
      { key: 'shift_reports_enabled', label: 'Shift Reports', icon: Clock, description: 'Shift summaries, cash reconciliation, and end-of-day reports.' },
    ],
    alwaysOn: ['Barcode Scanner', 'Loyalty', 'Commissions', 'Online Orders', 'Purchase Orders', 'Returns', 'Clients'],
  },
  {
    id: 'services',
    label: 'Services',
    icon: Wrench,
    description: 'Salons, spas, repair shops — appointment calendar, client records, staff scheduling.',
    configurable: [
      { key: 'enable_appointments', label: 'Appointments', icon: Calendar, description: 'Booking calendar for services, stylists, or technicians.' },
      { key: 'layaway_enabled', label: 'Layaway / Instalment', icon: Package, description: 'Allow customers to pay for services in instalments.' },
      { key: 'shift_reports_enabled', label: 'Shift Reports', icon: Clock, description: 'Shift summaries, cash reconciliation, and end-of-day reports.' },
    ],
    alwaysOn: ['Clients', 'Staff Schedule', 'Resources', 'Queue Management', 'Loyalty', 'Commissions'],
  },
  {
    id: 'quick_service',
    label: 'Quick Service',
    icon: ChefHat,
    description: 'Fast-food outlets, food courts, kiosks — simple order flow and kitchen display.',
    configurable: [
      { key: 'enable_kds', label: 'Kitchen Display System', icon: ChefHat, description: 'Show orders on kitchen screens; staff bump tickets to mark items ready.' },
      { key: 'shift_reports_enabled', label: 'Shift Reports', icon: Clock, description: 'Shift summaries, cash reconciliation, and end-of-day reports.' },
    ],
    alwaysOn: ['Online Orders'],
  },
  {
    id: 'pharmacy',
    label: 'Pharmacy',
    icon: FlaskConical,
    description: 'Dispensaries and pharmacies — drug inventory, prescription records, patient management.',
    configurable: [
      { key: 'shift_reports_enabled', label: 'Shift Reports', icon: Clock, description: 'Shift summaries, cash reconciliation, and end-of-day reports.' },
    ],
    alwaysOn: ['Patients', 'Drug Inventory', 'Controlled Substances Log'],
  },
];

export function ModulesTab() {
  const { data: settings, isLoading } = usePOSSettings();
  const updateModules = useUpdatePOSModules();
  const updateOutletConfig = useUpdateOutletConfig();
  const { can } = usePermissions();
  const { useCase: resolvedUseCase, isSuperUser } = useModuleAccess();
  const setOutlet = useAuthStore((s) => s.setOutlet);
  const outlet = useAuthStore((s) => s.outlet);
  const canEdit = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE) || isSuperUser;

  const [activeUC, setActiveUC] = useState<string>(resolvedUseCase ?? 'hospitality');
  const [modules, setModules] = useState<Record<ModuleToggleKey, boolean>>({
    hotel_module_enabled: false,
    enable_kds: false,
    enable_appointments: false,
    layaway_enabled: false,
    shift_reports_enabled: false,
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [assigningUC, setAssigningUC] = useState(false);

  useEffect(() => {
    if (resolvedUseCase) setActiveUC(resolvedUseCase);
  }, [resolvedUseCase]);

  useEffect(() => {
    if (settings) {
      setModules({
        hotel_module_enabled: settings.hotel_module_enabled ?? false,
        enable_kds: settings.enable_kds ?? false,
        enable_appointments: settings.enable_appointments ?? false,
        layaway_enabled: settings.layaway_enabled ?? false,
        shift_reports_enabled: settings.shift_reports_enabled ?? false,
      });
    }
  }, [settings]);

  const toggle = (key: ModuleToggleKey) => async (value: boolean) => {
    setModules((m) => ({ ...m, [key]: value }));
    setSaving(key);
    try {
      await updateModules.mutateAsync({ [key]: value });
    } catch {
      setModules((m) => ({ ...m, [key]: !value }));
    } finally {
      setSaving(null);
    }
  };

  const assignUseCase = async (ucId: string) => {
    setAssigningUC(true);
    try {
      await updateOutletConfig.mutateAsync({ use_case: ucId });
      setActiveUC(ucId);
      if (outlet) setOutlet({ ...outlet, use_case: ucId });
    } finally {
      setAssigningUC(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const activeDef = USE_CASE_DEFS.find((uc) => uc.id === activeUC) ?? USE_CASE_DEFS[0];
  const outletHasUseCase = !!resolvedUseCase;

  return (
    <div className="space-y-5">
      {!canEdit && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 text-amber-800 dark:text-amber-300 text-sm">
          <Lock className="h-4 w-4 shrink-0" />
          Module configuration requires admin or manager permissions.
        </div>
      )}

      {!outletHasUseCase && canEdit && (
        <div className="p-4 rounded-2xl border border-dashed border-primary/40 bg-primary/5 text-sm text-primary">
          <p className="font-semibold mb-1">Outlet type not configured</p>
          <p className="text-xs text-muted-foreground">
            Select a use case below to activate the matching feature set for this outlet.
          </p>
        </div>
      )}

      {/* Use-case tabs */}
      <div className="flex gap-1 p-1 rounded-2xl bg-muted/50 border border-border overflow-x-auto scrollbar-hide">
        {USE_CASE_DEFS.map((uc) => {
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

      {/* Description + assign */}
      <div className="flex items-start justify-between gap-4 px-1">
        <div>
          <p className="text-sm font-semibold">{activeDef.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{activeDef.description}</p>
        </div>
        {canEdit && resolvedUseCase !== activeDef.id && (
          <button
            type="button"
            disabled={assigningUC}
            onClick={() => assignUseCase(activeDef.id)}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-60"
          >
            {assigningUC ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {resolvedUseCase ? 'Switch to this use case' : 'Set use case'}
          </button>
        )}
        {resolvedUseCase === activeDef.id && (
          <span className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-semibold">
            <BadgeCheck className="h-3.5 w-3.5" /> Active use case
          </span>
        )}
      </div>

      {/* Configurable modules — 2-column grid on wider screens */}
      {activeDef.configurable.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Configurable Modules</p>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {activeDef.configurable.map((feat) => {
              const Icon = feat.icon;
              const on = modules[feat.key];
              return (
                <label
                  key={feat.key}
                  className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-colors select-none
                    ${on ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}
                    ${!canEdit ? 'cursor-default opacity-70' : ''}`}
                >
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${on ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {saving === feat.key
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Icon className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">{feat.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{feat.description}</p>
                  </div>
                  <Toggle
                    checked={on}
                    onChange={(v) => toggle(feat.key)(v)}
                    disabled={!canEdit || saving === feat.key}
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Always-on — grid of cards */}
      {activeDef.alwaysOn.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Always Included</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
            {activeDef.alwaysOn.map((feat) => (
              <div
                key={feat}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-muted-foreground"
              >
                <BadgeCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">{feat}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
