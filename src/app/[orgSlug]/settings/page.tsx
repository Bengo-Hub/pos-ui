'use client';

import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { P } from '@/lib/rbac/permissions';
import { usePOSSettings, useUpdatePOSSettings, useUpdatePOSModules, useUpdateShiftSettings, useUpdateOutletConfig } from '@/hooks/usePOSSettings';
import { useAllKDSStations, useCreateKDSStation, useUpdateKDSStation, useDeleteKDSStation } from '@/hooks/useKDS';
import { TablesSettingsTab } from '@/components/settings/TablesSettingsTab';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { PrinterProfile } from '@/lib/api/settings';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import {
  BadgeCheck,
  BedDouble,
  Calendar,
  Check,
  ChefHat,
  Clock,
  FlaskConical,
  Globe,
  Layers,
  Link2,
  Loader2,
  Lock,
  Palette,
  Package,
  Pencil,
  Plus,
  Printer,
  Receipt,
  Save,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Table2,
  Trash2,
  UtensilsCrossed,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type Tab = 'general' | 'receipt' | 'modules' | 'shifts' | 'kds_stations' | 'tables' | 'integrations' | 'platform';

const ALL_TABS: { id: Tab; label: string; icon: React.ElementType; requireModule?: string }[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'receipt', label: 'Receipt & Printing', icon: Receipt },
  { id: 'modules', label: 'Modules', icon: Layers },
  { id: 'shifts', label: 'Shifts', icon: Clock },
  { id: 'kds_stations', label: 'KDS Stations', icon: ChefHat, requireModule: 'kds' },
  { id: 'tables', label: 'Tables', icon: Table2, requireModule: 'tables' },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
  { id: 'platform', label: 'Platform', icon: ShieldCheck },
];

// ── Toggle component ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none
        ${checked ? 'bg-primary' : 'bg-muted'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

// ── Input + Select helpers ──────────────────────────────────────────────────────

const inputClass = 'w-full bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed';
const labelClass = 'text-xs font-bold text-muted-foreground uppercase tracking-wider';

// ══════════════════════════════════════════════════════════════════════════════
// General tab
// ══════════════════════════════════════════════════════════════════════════════

function GeneralTab() {
  const { tenant, isLoading: brandingLoading } = useTenantBranding();
  const { data: settings, isLoading } = usePOSSettings();
  const updateSettings = useUpdatePOSSettings();
  const { can } = usePermissions();
  const canEdit = can(P.CONFIG_CHANGE) || can(P.CONFIG_MANAGE);

  const [currency, setCurrency] = useState('KES');
  const [vatRate, setVatRate] = useState('16');
  const [vatEnabled, setVatEnabled] = useState(true);

  useEffect(() => {
    if (settings) {
      setCurrency(settings.currency || 'KES');
      setVatRate(String(settings.vat_rate ?? 16));
      setVatEnabled(settings.vat_enabled ?? true);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({ currency, vat_rate: parseFloat(vatRate) || 16, vat_enabled: vatEnabled });
  };

  return (
    <div className="space-y-6">
      {/* Branding (read-only) */}
      {!brandingLoading && tenant && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <span className="font-bold text-sm">Tenant Branding</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Branding is managed in the auth portal. Contact your platform admin to update the logo or colors.
            </p>
            <div className="flex items-center gap-4">
              {tenant.logoUrl && <img src={tenant.logoUrl} alt={tenant.name ?? ''} className="h-10 object-contain" />}
              {tenant.primaryColor && (
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg border border-border" style={{ backgroundColor: tenant.primaryColor }} />
                  <span className="text-xs font-mono text-muted-foreground">{tenant.primaryColor}</span>
                </div>
              )}
              <div>
                <p className="text-sm font-semibold">{tenant.orgName ?? tenant.name}</p>
                <p className="text-xs text-muted-foreground">{tenant.slug}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Currency & VAT */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Currency & Tax</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-24 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className={labelClass}>Currency</label>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!canEdit} className={inputClass}>
                    <option value="KES">KES — Kenyan Shilling</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="TZS">TZS — Tanzanian Shilling</option>
                    <option value="UGX">UGX — Ugandan Shilling</option>
                    <option value="ZAR">ZAR — South African Rand</option>
                    <option value="NGN">NGN — Nigerian Naira</option>
                    <option value="GHS">GHS — Ghanaian Cedi</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className={labelClass}>VAT / Tax Rate (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    disabled={!canEdit}
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-accent/10 border border-border">
                <div>
                  <h4 className="text-sm font-bold">Show VAT Breakdown on Receipts</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Display VAT as a separate line item on customer receipts.</p>
                </div>
                <Toggle checked={vatEnabled} onChange={setVatEnabled} disabled={!canEdit} />
              </div>

              <div className="flex items-center justify-end gap-3">
                {!canEdit && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Lock className="h-3 w-3" /> View only
                  </p>
                )}
                <Button onClick={handleSave} disabled={!canEdit || updateSettings.isPending} className="gap-2 px-8 shadow-lg shadow-primary/10">
                  {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {updateSettings.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Receipt & Printing tab
// ══════════════════════════════════════════════════════════════════════════════

const RECEIPT_PRINTER_ROLES = [
  { id: 'customer', label: 'Customer Receipt', desc: 'Full receipt printed at point of sale' },
  { id: 'kitchen', label: 'Kitchen Printer', desc: 'Kitchen ticket (no prices) sent on order open' },
  { id: 'bar', label: 'Bar Printer', desc: 'Bar ticket for drinks and cocktails' },
  { id: 'waiter', label: 'Waiter Copy', desc: 'Order summary for the serving staff' },
];

function ReceiptTab() {
  const { data: settings, isLoading } = usePOSSettings();
  const updateSettings = useUpdatePOSSettings();
  const { can } = usePermissions();
  const canEdit = can(P.CONFIG_CHANGE) || can(P.CONFIG_MANAGE);

  const [form, setForm] = useState({
    receiptHeader: '',
    receiptFooter: '',
    autoPrintOrder: false,
    autoPrintKitchen: false,
  });
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);

  useEffect(() => {
    if (settings) {
      setForm({
        receiptHeader: settings.receipt_header ?? '',
        receiptFooter: settings.receipt_footer ?? '',
        autoPrintOrder: settings.auto_print_order ?? false,
        autoPrintKitchen: settings.auto_print_kitchen ?? false,
      });
      setProfiles(settings.printer_profiles ?? []);
    }
  }, [settings]);

  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const setProfile = (id: string, field: keyof PrinterProfile, value: unknown) => {
    setProfiles((prev) => {
      const existing = prev.find((p) => p.id === id);
      if (existing) {
        return prev.map((p) => p.id === id ? { ...p, [field]: value } : p);
      }
      const role = RECEIPT_PRINTER_ROLES.find((r) => r.id === id);
      return [...prev, { id, label: role?.label ?? id, printer_type: 'none', [field]: value } as PrinterProfile];
    });
  };

  const getProfile = (id: string): PrinterProfile =>
    profiles.find((p) => p.id === id) ?? { id, label: id, printer_type: 'none' };

  const handleSave = () => {
    updateSettings.mutate({
      receipt_header: form.receiptHeader || null,
      receipt_footer: form.receiptFooter || null,
      auto_print_order: form.autoPrintOrder,
      auto_print_kitchen: form.autoPrintKitchen,
      printer_profiles: profiles.filter((p) => p.printer_type !== 'none'),
    });
  };

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Receipt Content</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className={labelClass}>Header Text</label>
              <textarea
                rows={3}
                value={form.receiptHeader}
                onChange={(e) => set('receiptHeader', e.target.value)}
                disabled={!canEdit}
                placeholder="Business name, address…"
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Footer Text</label>
              <textarea
                rows={3}
                value={form.receiptFooter}
                onChange={(e) => set('receiptFooter', e.target.value)}
                disabled={!canEdit}
                placeholder="Thank you message, social handles…"
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto-print behavior */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Auto-Print Behavior</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: 'autoPrintOrder' as const, label: 'Auto-Print Receipt on Completion', desc: 'Automatically print customer receipt when a sale is completed.' },
            { key: 'autoPrintKitchen' as const, label: 'Auto-Print Kitchen Ticket', desc: 'Send a kitchen order ticket when an order is created.' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-accent/10 border border-border">
              <div>
                <h4 className="text-sm font-bold">{item.label}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
              <Toggle checked={form[item.key]} onChange={(v) => set(item.key, v)} disabled={!canEdit} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Multi-printer profiles */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Printer Profiles</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Configure separate printers for customer receipts, kitchen tickets, and bar orders.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {RECEIPT_PRINTER_ROLES.map((role) => {
            const p = getProfile(role.id);
            return (
              <div key={role.id} className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">{role.label}</p>
                    <p className="text-xs text-muted-foreground">{role.desc}</p>
                  </div>
                  <select value={p.printer_type} onChange={(e) => setProfile(role.id, 'printer_type', e.target.value as any)} disabled={!canEdit} className={`${inputClass} w-40`}>
                    <option value="none">Disabled</option>
                    <option value="network">Network (ESC/POS)</option>
                    <option value="browser">Browser Print</option>
                    <option value="bluetooth">Bluetooth</option>
                  </select>
                </div>
                {p.printer_type === 'network' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className={labelClass}>Printer IP</label>
                      <input value={p.printer_ip ?? ''} onChange={(e) => setProfile(role.id, 'printer_ip', e.target.value)} disabled={!canEdit} placeholder="192.168.1.100" className={`${inputClass} font-mono`} />
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>Paper Width</label>
                      <select value={p.paper_width ?? '80mm'} onChange={(e) => setProfile(role.id, 'paper_width', e.target.value)} disabled={!canEdit} className={inputClass}>
                        <option value="58mm">58mm</option>
                        <option value="80mm">80mm</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {!canEdit && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Lock className="h-3 w-3" /> View only
          </p>
        )}
        <Button onClick={handleSave} disabled={!canEdit || updateSettings.isPending} className="gap-2 px-8 shadow-lg shadow-primary/10">
          {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {updateSettings.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Modules tab — use-case-based feature configuration
// ══════════════════════════════════════════════════════════════════════════════

type ModuleToggleKey = 'hotel_module_enabled' | 'enable_kds' | 'enable_appointments' | 'layaway_enabled' | 'shift_reports_enabled';

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

function ModulesTab() {
  const { data: settings, isLoading } = usePOSSettings();
  const updateModules = useUpdatePOSModules();
  const updateOutletConfig = useUpdateOutletConfig();
  const { can } = usePermissions();
  const { useCase: resolvedUseCase, isSuperUser } = useModuleAccess();
  const setOutlet = useAuthStore((s) => s.setOutlet);
  const outlet = useAuthStore((s) => s.outlet);
  const canEdit = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE) || isSuperUser;

  // Active use-case tab — default to resolved outlet use case, or first tab
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
      // Update local outlet store so sidebar re-gates immediately
      if (outlet) {
        setOutlet({ ...outlet, use_case: ucId });
      }
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

      {/* Use-case not configured — prompt */}
      {!outletHasUseCase && canEdit && (
        <div className="p-4 rounded-2xl border border-dashed border-primary/40 bg-primary/5 text-sm text-primary">
          <p className="font-semibold mb-1">Outlet type not configured</p>
          <p className="text-xs text-muted-foreground">Select a use case below to activate the matching feature set for this outlet. Features are pre-selected based on the use case.</p>
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

      {/* Use-case description + assign button */}
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

      {/* Configurable modules */}
      {activeDef.configurable.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Configurable Modules</p>
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
                  {saving === feat.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">{feat.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{feat.description}</p>
                </div>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!canEdit || saving === feat.key}
                  onChange={(e) => toggle(feat.key)(e.target.checked)}
                  className="h-4 w-4 mt-1 rounded accent-primary shrink-0 cursor-pointer disabled:cursor-not-allowed"
                />
              </label>
            );
          })}
        </div>
      )}

      {/* Always-on features */}
      {activeDef.alwaysOn.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Always Included</p>
          <div className="flex flex-wrap gap-2">
            {activeDef.alwaysOn.map((feat) => (
              <span key={feat} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-muted/50 text-xs font-semibold text-muted-foreground">
                <BadgeCheck className="h-3 w-3 text-primary shrink-0" />
                {feat}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Shifts tab
// ══════════════════════════════════════════════════════════════════════════════

function ShiftsTab() {
  const { data: settings, isLoading } = usePOSSettings();
  const updateShifts = useUpdateShiftSettings();
  const { can } = usePermissions();
  const { isSuperUser } = useModuleAccess();
  const canEdit = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE) || isSuperUser;

  const [autoEnd, setAutoEnd] = useState(false);
  const [maxHours, setMaxHours] = useState(12);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setAutoEnd(settings.shift_auto_end_enabled ?? false);
      setMaxHours(settings.shift_max_hours ?? 12);
    }
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateShifts.mutateAsync({ shift_auto_end_enabled: autoEnd, shift_max_hours: maxHours });
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 text-amber-800 dark:text-amber-300 text-sm">
          <Lock className="h-4 w-4 shrink-0" />
          Shift configuration requires admin or manager permissions.
        </div>
      )}

      <Card>
        <CardHeader>
          <h3 className="text-base font-bold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Shift Duration Limits
          </h3>
          <p className="text-sm text-muted-foreground">
            Automatically end shifts that exceed the maximum duration to prevent forgotten open sessions.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Auto-end shifts</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Close open shift sessions after the configured maximum hours.
              </p>
            </div>
            <Toggle checked={autoEnd} onChange={setAutoEnd} disabled={!canEdit} />
          </div>

          {autoEnd && (
            <div className="flex items-center gap-4 pt-2 border-t border-border">
              <div className="flex-1">
                <label className="text-sm font-semibold block mb-1">Maximum shift length (hours)</label>
                <p className="text-xs text-muted-foreground">Shifts open longer than this will be auto-closed. Range: 1–24 hours.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!canEdit || maxHours <= 1}
                  onClick={() => setMaxHours((h) => Math.max(1, h - 1))}
                  className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-12 text-center font-bold tabular-nums text-sm">{maxHours}h</span>
                <button
                  type="button"
                  disabled={!canEdit || maxHours >= 24}
                  onClick={() => setMaxHours((h) => Math.min(24, h + 1))}
                  className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <Button onClick={handleSave} disabled={!canEdit || saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save shift settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Integrations tab
// ══════════════════════════════════════════════════════════════════════════════

const AUTH_API_URL_DEFAULT = process.env.NEXT_PUBLIC_AUTH_API_URL || 'https://sso.codevertexitsolutions.com';
const POS_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://posapi.codevertexitsolutions.com';

function IntegrationsTab() {
  const [authApiUrl, setAuthApiUrl] = useState(AUTH_API_URL_DEFAULT);
  const [allowedOrigins, setAllowedOrigins] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle');
  const [saving, setSaving] = useState(false);

  const testConnection = async () => {
    setTestStatus('loading');
    try {
      const res = await fetch(`${authApiUrl}/healthz`);
      setTestStatus(res.ok ? 'ok' : 'fail');
    } catch {
      setTestStatus('fail');
    }
  };

  const handleSave = async () => {
    if (!allowedOrigins.trim()) { toast.success('No changes to save'); return; }
    setSaving(true);
    try {
      await apiClient.put('/api/v1/admin/config/allowed_origins', {
        config_value: allowedOrigins,
        config_type: 'string',
      });
      toast.success('Saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">S2S Auth</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className={labelClass}>Auth-API URL</label>
            <div className="flex gap-3">
              <input
                value={authApiUrl}
                onChange={(e) => setAuthApiUrl(e.target.value)}
                className={`${inputClass} flex-1`}
              />
              <Button type="button" size="sm" onClick={testConnection} disabled={testStatus === 'loading'}>
                {testStatus === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Test'}
              </Button>
            </div>
            {testStatus === 'ok' && <p className="text-xs text-green-600">Connection successful</p>}
            {testStatus === 'fail' && <p className="text-xs text-red-600">Connection failed</p>}
          </div>
          <div className="space-y-2">
            <label className={labelClass}>POS API URL</label>
            <input value={POS_API_URL} readOnly className={`${inputClass} opacity-60 cursor-not-allowed`} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">CORS</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className={labelClass}>Allowed Origins</label>
            <input
              value={allowedOrigins}
              onChange={(e) => setAllowedOrigins(e.target.value)}
              placeholder="https://app.example.com, https://admin.example.com"
              className={inputClass}
            />
            <p className="text-xs text-muted-foreground">Comma-separated list of allowed CORS origins.</p>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Platform tab (superuser / platform owner only)
// ══════════════════════════════════════════════════════════════════════════════

function PlatformTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Platform Configuration</span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Platform-level settings such as service config, license keys, and infrastructure defaults are managed here.
            These settings affect all tenants and require platform admin access.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// KDS Stations tab
// ══════════════════════════════════════════════════════════════════════════════

const KDS_CATEGORIES = ['food', 'mains', 'starters', 'desserts', 'drinks', 'cocktails', 'mocktails', 'beverages', 'sides'];

function KDSStationsTab() {
  const { data, isLoading } = useAllKDSStations();
  const createStation = useCreateKDSStation();
  const updateStation = useUpdateKDSStation();
  const deleteStation = useDeleteKDSStation();
  const { can } = usePermissions();
  const outlet = useAuthStore((s) => s.outlet);
  const canEdit = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', category_filter: [] as string[], sort_order: 0 });

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', category_filter: [] as string[], sort_order: 0 });

  // Confirm dialogs
  type StationRef = { id: string; name: string; is_active: boolean };
  const [confirmToggle, setConfirmToggle] = useState<StationRef | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StationRef | null>(null);

  const stations = data?.data ?? [];

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    try {
      await createStation.mutateAsync({ outlet_id: outlet?.id ?? '', name: form.name, category_filter: form.category_filter, sort_order: form.sort_order });
      setForm({ name: '', category_filter: [], sort_order: 0 });
      setShowForm(false);
      toast.success('Station created');
    } catch {
      toast.error('Failed to create station');
    }
  };

  const toggleActive = (s: StationRef) => setConfirmToggle(s);

  const doToggleActive = () => {
    if (!confirmToggle) return;
    const action = confirmToggle.is_active ? 'deactivate' : 'reactivate';
    updateStation.mutate({ stationID: confirmToggle.id, input: { is_active: !confirmToggle.is_active } }, {
      onSuccess: () => { toast.success(`Station ${action}d`); setConfirmToggle(null); },
      onError: () => { toast.error(`Failed to ${action} station`); setConfirmToggle(null); },
    });
  };

  const startEdit = (s: { id: string; name: string; category_filter: string[]; sort_order: number }) => {
    setEditingId(s.id);
    setEditForm({ name: s.name, category_filter: s.category_filter ?? [], sort_order: s.sort_order });
  };

  const handleSaveEdit = async (stationID: string) => {
    if (!editForm.name.trim()) return;
    try {
      await updateStation.mutateAsync({ stationID, input: { name: editForm.name, category_filter: editForm.category_filter, sort_order: editForm.sort_order } });
      setEditingId(null);
      toast.success('Station updated');
    } catch {
      toast.error('Failed to update station');
    }
  };

  const handleDelete = (s: StationRef) => setConfirmDelete(s);

  const doDelete = () => {
    if (!confirmDelete) return;
    deleteStation.mutate(confirmDelete.id, {
      onSuccess: () => { toast.success(`Station "${confirmDelete.name}" deleted`); setConfirmDelete(null); },
      onError: () => { toast.error('Failed to delete station'); setConfirmDelete(null); },
    });
  };

  if (isLoading) return <div className="h-40 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Configure kitchen and bar display stations. Category filters route specific items to each station.</p>
        {canEdit && (
          <Button size="sm" onClick={() => { setShowForm(!showForm); setEditingId(null); }} className="gap-2">
            <Plus className="h-4 w-4" /> Add Station
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={labelClass}>Station Name</label>
                <input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Kitchen, Bar" className={inputClass} />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Sort Order</label>
                <input type="number" min={0} value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} className={`${inputClass} font-mono`} />
              </div>
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Category Filters (leave empty to show all)</label>
              <div className="flex flex-wrap gap-2">
                {KDS_CATEGORIES.map((cat) => {
                  const selected = form.category_filter.includes(cat);
                  return (
                    <button key={cat} type="button"
                      onClick={() => setForm((f) => ({ ...f, category_filter: selected ? f.category_filter.filter((c) => c !== cat) : [...f.category_filter, cat] }))}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${selected ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary'}`}
                    >{cat}</button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={createStation.isPending || !form.name.trim()}>
                {createStation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stations.length === 0 && !showForm && (
        <div className="text-center py-12 text-muted-foreground text-sm">No KDS stations configured. Add your first station to get started.</div>
      )}

      <div className="space-y-2">
        {stations.map((station) => {
          const isEditing = editingId === station.id;
          return (
            <div key={station.id} className={`rounded-xl border bg-card transition-opacity ${!station.is_active ? 'opacity-50' : ''}`}>
              {isEditing ? (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className={labelClass}>Station Name</label>
                      <input autoFocus value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} />
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>Sort Order</label>
                      <input type="number" min={0} value={editForm.sort_order} onChange={(e) => setEditForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} className={`${inputClass} font-mono`} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>Category Filters</label>
                    <div className="flex flex-wrap gap-2">
                      {KDS_CATEGORIES.map((cat) => {
                        const sel = editForm.category_filter.includes(cat);
                        return (
                          <button key={cat} type="button"
                            onClick={() => setEditForm((f) => ({ ...f, category_filter: sel ? f.category_filter.filter((c) => c !== cat) : [...f.category_filter, cat] }))}
                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${sel ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary'}`}
                          >{cat}</button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5 mr-1" />Cancel</Button>
                    <Button size="sm" onClick={() => handleSaveEdit(station.id)} disabled={updateStation.isPending || !editForm.name.trim()}>
                      {updateStation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />} Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold">{station.name}</p>
                      {!station.is_active && <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Inactive</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(station.category_filter ?? []).length > 0
                        ? (station.category_filter ?? []).map((c) => <span key={c} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">{c}</span>)
                        : <span className="text-[10px] text-muted-foreground">All categories</span>}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">#{station.sort_order}</span>
                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <Toggle checked={station.is_active} onChange={() => toggleActive({ id: station.id, name: station.name, is_active: station.is_active })} />
                      <button onClick={() => startEdit(station)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Edit station">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete({ id: station.id, name: station.name, is_active: station.is_active })} disabled={deleteStation.isPending} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete station">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!confirmToggle}
        onOpenChange={(o) => { if (!o) setConfirmToggle(null); }}
        title={confirmToggle?.is_active ? 'Deactivate station?' : 'Reactivate station?'}
        description={confirmToggle?.is_active
          ? `"${confirmToggle?.name}" will stop receiving tickets until reactivated.`
          : `"${confirmToggle?.name}" will start receiving tickets again.`}
        confirmLabel={confirmToggle?.is_active ? 'Deactivate' : 'Reactivate'}
        variant={confirmToggle?.is_active ? 'warning' : 'info'}
        loading={updateStation.isPending}
        onConfirm={doToggleActive}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Delete station "${confirmDelete?.name}"?`}
        description="Historical ticket data will be preserved, but this station will no longer appear anywhere."
        confirmLabel="Delete Station"
        variant="danger"
        loading={deleteStation.isPending}
        onConfirm={doDelete}
      />
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// Root settings page
// ══════════════════════════════════════════════════════════════════════════════

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const user = useAuthStore((s) => s.user);
  const { isSuperUser, hasModule } = useModuleAccess();
  const isPlatformOwner = isSuperUser || user?.isPlatformOwner;

  const visibleTabs = ALL_TABS.filter((t) => {
    if (t.id === 'platform') return isPlatformOwner;
    if (t.requireModule) return isSuperUser || hasModule(t.requireModule);
    return true;
  });

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">POS Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">Manage receipt format, printer, modules, and integrations.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-2xl bg-muted/50 border border-border overflow-x-auto scrollbar-hide">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all
                ${active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'receipt' && <ReceiptTab />}
        {activeTab === 'modules' && <ModulesTab />}
        {activeTab === 'shifts' && <ShiftsTab />}
        {activeTab === 'kds_stations' && <KDSStationsTab />}
        {activeTab === 'tables' && <TablesSettingsTab />}
        {activeTab === 'integrations' && <IntegrationsTab />}
        {activeTab === 'platform' && isPlatformOwner && <PlatformTab />}
      </div>
    </div>
  );
}
