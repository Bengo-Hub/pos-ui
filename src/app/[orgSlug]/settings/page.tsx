'use client';

import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { P } from '@/lib/rbac/permissions';
import { usePOSSettings, useUpdatePOSSettings, useUpdatePOSModules } from '@/hooks/usePOSSettings';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import {
  BedDouble,
  Calendar,
  ChefHat,
  Clock,
  Globe,
  Layers,
  Link2,
  Loader2,
  Lock,
  Palette,
  Package,
  Printer,
  Receipt,
  Save,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type Tab = 'general' | 'receipt' | 'modules' | 'integrations' | 'platform';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'receipt', label: 'Receipt & Printing', icon: Receipt },
  { id: 'modules', label: 'Modules', icon: Layers },
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

function ReceiptTab() {
  const { data: settings, isLoading } = usePOSSettings();
  const updateSettings = useUpdatePOSSettings();
  const { can } = usePermissions();
  const canEdit = can(P.CONFIG_CHANGE) || can(P.CONFIG_MANAGE);

  const [form, setForm] = useState({
    receiptHeader: '',
    receiptFooter: '',
    printerType: 'thermal',
    printerIP: '',
    paperWidth: '80mm',
    autoPrintOrder: false,
    autoPrintKitchen: false,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        receiptHeader: settings.receipt_header ?? '',
        receiptFooter: settings.receipt_footer ?? '',
        printerType: settings.printer_type ?? 'thermal',
        printerIP: settings.printer_ip ?? '',
        paperWidth: settings.paper_width ?? '80mm',
        autoPrintOrder: settings.auto_print_order ?? false,
        autoPrintKitchen: settings.auto_print_kitchen ?? false,
      });
    }
  }, [settings]);

  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    updateSettings.mutate({
      receipt_header: form.receiptHeader || null,
      receipt_footer: form.receiptFooter || null,
      printer_type: form.printerType,
      printer_ip: form.printerIP || null,
      paper_width: form.paperWidth,
      auto_print_order: form.autoPrintOrder,
      auto_print_kitchen: form.autoPrintKitchen,
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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Printer Configuration</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className={labelClass}>Printer Type</label>
              <select value={form.printerType} onChange={(e) => set('printerType', e.target.value)} disabled={!canEdit} className={inputClass}>
                <option value="thermal">Thermal (ESC/POS)</option>
                <option value="network">Network Printer</option>
                <option value="bluetooth">Bluetooth</option>
                <option value="none">No Printer</option>
              </select>
            </div>
            {form.printerType !== 'none' && form.printerType !== 'bluetooth' && (
              <div className="space-y-2">
                <label className={labelClass}>Printer IP / Address</label>
                <input
                  value={form.printerIP}
                  onChange={(e) => set('printerIP', e.target.value)}
                  disabled={!canEdit}
                  placeholder="192.168.1.100"
                  className={`${inputClass} font-mono`}
                />
              </div>
            )}
            <div className="space-y-2">
              <label className={labelClass}>Paper Width</label>
              <select value={form.paperWidth} onChange={(e) => set('paperWidth', e.target.value)} disabled={!canEdit} className={inputClass}>
                <option value="58mm">58mm</option>
                <option value="80mm">80mm</option>
              </select>
            </div>
          </div>

          {[
            { key: 'autoPrintOrder' as const, label: 'Auto-Print on Order', desc: 'Automatically print receipt when a sale is completed.' },
            { key: 'autoPrintKitchen' as const, label: 'Print Kitchen Ticket', desc: 'Send a kitchen order ticket to the kitchen printer.' },
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
// Modules tab
// ══════════════════════════════════════════════════════════════════════════════

interface ModuleCardProps {
  icon: React.ElementType;
  name: string;
  description: string;
  useCases?: string[];
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  saving?: boolean;
}

function ModuleCard({ icon: Icon, name, description, useCases, checked, onChange, disabled, saving }: ModuleCardProps) {
  return (
    <div className={`flex items-start gap-4 p-5 rounded-2xl border transition-colors ${checked ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}`}>
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${checked ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-bold">{name}</h4>
          {useCases && useCases.map((uc) => (
            <span key={uc} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              {uc}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled || saving} />
    </div>
  );
}

function ModulesTab() {
  const { data: settings, isLoading } = usePOSSettings();
  const updateModules = useUpdatePOSModules();
  const { can } = usePermissions();
  const { isSuperUser } = useModuleAccess();
  const canEdit = can(P.CONFIG_MANAGE) || isSuperUser;

  const [modules, setModules] = useState({
    hotel_module_enabled: false,
    layaway_enabled: false,
    shift_reports_enabled: false,
  });
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setModules({
        hotel_module_enabled: settings.hotel_module_enabled ?? false,
        layaway_enabled: settings.layaway_enabled ?? false,
        shift_reports_enabled: settings.shift_reports_enabled ?? false,
      });
    }
  }, [settings]);

  const toggle = (key: keyof typeof modules) => async (value: boolean) => {
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

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!canEdit && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 text-amber-800 dark:text-amber-300 text-sm">
          <Lock className="h-4 w-4 shrink-0" />
          Module configuration requires admin or manager permissions.
        </div>
      )}

      <ModuleCard
        icon={BedDouble}
        name="Hotel / Rooms"
        description="Enable room management, check-in/check-out, and room billing for hospitality operations."
        useCases={['hospitality']}
        checked={modules.hotel_module_enabled}
        onChange={toggle('hotel_module_enabled')}
        disabled={!canEdit}
        saving={saving === 'hotel_module_enabled'}
      />
      <ModuleCard
        icon={Package}
        name="Layaway"
        description="Allow customers to reserve items with a deposit and pay the balance later."
        useCases={['retail', 'services']}
        checked={modules.layaway_enabled}
        onChange={toggle('layaway_enabled')}
        disabled={!canEdit}
        saving={saving === 'layaway_enabled'}
      />
      <ModuleCard
        icon={Clock}
        name="Shift Reports"
        description="Enable detailed shift summaries, cash reconciliation, and end-of-day reports."
        checked={modules.shift_reports_enabled}
        onChange={toggle('shift_reports_enabled')}
        disabled={!canEdit}
        saving={saving === 'shift_reports_enabled'}
      />
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
// Root settings page
// ══════════════════════════════════════════════════════════════════════════════

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const user = useAuthStore((s) => s.user);
  const { isSuperUser } = useModuleAccess();
  const isPlatformOwner = isSuperUser || user?.isPlatformOwner;

  const visibleTabs = TABS.filter((t) => t.id !== 'platform' || isPlatformOwner);

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
        {activeTab === 'integrations' && <IntegrationsTab />}
        {activeTab === 'platform' && isPlatformOwner && <PlatformTab />}
      </div>
    </div>
  );
}
