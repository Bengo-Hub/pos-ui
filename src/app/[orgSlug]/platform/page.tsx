'use client';

import { useAuthStore } from '@/store/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { usePOSSettings, useUpdatePOSSettings, useUpdatePOSModules } from '@/hooks/usePOSSettings';
import { useSubscription } from '@/hooks/use-subscription';
import { Toggle } from '@/components/settings/shared';
import { apiClient } from '@/lib/api/client';
import { Badge, Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  ChefHat,
  Clock,
  CreditCard,
  Globe,
  Grid3X3,
  Hotel,
  Key,
  LayoutGrid,
  List,
  Loader2,
  Monitor,
  Plus,
  Printer,
  Save,
  Settings,
  Shield,
  Smartphone,
  Tablet,
  Trash2,
  Warehouse,
} from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { P } from '@/lib/rbac/permissions';

/* ─── Types ──────────────────────────────────────────────────────────── */

interface POSDevice {
  id: string;
  device_code: string;
  device_type: string;
  status: string;
  outlet_name?: string;
  last_seen_at?: string | null;
  registered_at: string;
}

interface KdsStation {
  id: string;
  name: string;
  categories: string[];
  is_active: boolean;
}

type TabKey = 'devices' | 'licenses' | 'outlet' | 'kds' | 'tax' | 'modules';

const PLATFORM_ONLY_TABS: TabKey[] = ['devices', 'licenses'];

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function relativeTime(isoString?: string | null): string {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(isoString).toLocaleDateString();
}

const inputCls =
  'w-full rounded-lg border border-input bg-transparent px-4 py-2 text-sm focus:ring-1 focus:ring-ring focus:outline-none placeholder:text-muted-foreground';

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function PlatformPage() {
  const user = useAuthStore((state) => state.user);
  const tenantID = user?.tenant_id ?? '';
  const { isSuperuser, can } = usePermissions();
  const { isSuperUser } = useModuleAccess();
  const { isPlatformOwner: isSubPlatform } = useSubscription();
  const router = useRouter();
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const searchParams = useSearchParams();

  const isPlatformOwner =
    isSuperuser || isSuperUser || isSubPlatform || user?.isPlatformOwner || user?.isSuperUser || orgSlug === 'codevertex';

  const userRoles = user?.roles ?? [];
  const isHQAdmin =
    isPlatformOwner ||
    userRoles.some((r) =>
      ['admin', 'pos_admin', 'manager', 'store_manager', 'superuser', 'super_admin'].includes(r)
    ) ||
    can(P.CONFIG_MANAGE) ||
    can(P.CONFIG_CHANGE);

  const [activeTab, setActiveTab] = useState<TabKey>('outlet');

  useEffect(() => {
    const raw = searchParams?.get('tab') as TabKey | null;
    if (raw) {
      if (PLATFORM_ONLY_TABS.includes(raw) && !isPlatformOwner) {
        setActiveTab('outlet');
      } else {
        setActiveTab(raw);
      }
    } else if (isPlatformOwner) {
      setActiveTab('devices');
    }
  }, [isPlatformOwner, searchParams]);

  useEffect(() => {
    if (user && !isHQAdmin) {
      router.replace(`/${orgSlug}/unauthorized`);
    }
  }, [user, isHQAdmin, orgSlug, router]);

  if (!user || !isHQAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto opacity-30" />
          <p className="text-sm text-muted-foreground">Redirecting…</p>
        </div>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; icon: typeof Monitor }[] = [
    ...(isPlatformOwner
      ? [
          { key: 'devices' as TabKey, label: 'Devices', icon: Monitor },
          { key: 'licenses' as TabKey, label: 'Licenses', icon: Key },
        ]
      : []),
    { key: 'outlet', label: 'Outlet Config', icon: Settings },
    { key: 'kds', label: 'KDS Stations', icon: ChefHat },
    { key: 'tax', label: 'Tax & VAT', icon: Grid3X3 },
    { key: 'modules', label: 'Modules', icon: LayoutGrid },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={isPlatformOwner ? 'warning' : 'outline'}>
            {isPlatformOwner ? 'Platform Admin' : 'Admin'}
          </Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          {isPlatformOwner ? 'Platform Management' : 'Outlet Configuration'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isPlatformOwner
            ? 'Device provisioning, licensing, outlet config, and module management.'
            : 'Configure KDS stations, tax settings, and feature modules for this outlet.'}
        </p>
      </div>

      {/* ─── Tab Bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap bg-accent/30 p-1 rounded-lg w-fit gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-all',
                activeTab === tab.key
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 inline mr-1.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'devices'  && <DevicesTab  tenantID={tenantID} />}
      {activeTab === 'licenses' && <LicensesTab />}
      {activeTab === 'outlet'   && <OutletConfigTab tenantID={tenantID} />}
      {activeTab === 'kds'      && <KDSTab      tenantID={tenantID} />}
      {activeTab === 'tax'      && <TaxTab      tenantID={tenantID} />}
      {activeTab === 'modules'  && <ModulesTab  tenantID={tenantID} />}
    </div>
  );
}

/* ─── Devices Tab ────────────────────────────────────────────────────── */

function DevicesTab({ tenantID }: { tenantID: string }) {
  const { data, isLoading, refetch } = useQuery<{ data: POSDevice[]; total: number }>({
    queryKey: ['pos-devices', tenantID],
    queryFn: () => apiClient.get(`/api/v1/${tenantID}/pos/devices`),
    enabled: !!tenantID,
    staleTime: 30_000,
  });

  const devices = data?.data ?? [];
  const deviceIcons: Record<string, typeof Monitor> = {
    terminal: Monitor, web_terminal: Monitor, tablet: Tablet, mobile: Smartphone,
  };
  const statusVariant = (s: string) =>
    s === 'active' ? 'success' : s === 'pending' ? 'warning' : 'outline';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? '…' : `${devices.length} device${devices.length !== 1 ? 's' : ''} registered`}
        </p>
        <Button size="sm" className="gap-2" onClick={() => refetch()}>Refresh</Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : devices.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground border-2 border-dashed border-border rounded-2xl">
          <Monitor className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No devices registered yet.</p>
          <p className="text-xs mt-1">Devices are auto-provisioned when a staff member first opens a shift on a terminal.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {devices.map((device) => {
            const DevIcon = deviceIcons[device.device_type] ?? Monitor;
            return (
              <Card key={device.id} className="hover:border-primary/30 transition-all">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      'h-12 w-12 rounded-xl flex items-center justify-center border border-border',
                      device.status === 'active'  ? 'bg-green-500/10 text-green-500' :
                      device.status === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                                                    'bg-accent/30 text-muted-foreground'
                    )}>
                      <DevIcon className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-sm font-mono truncate">{device.device_code}</h4>
                        <Badge variant={statusVariant(device.status)}>{device.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground capitalize mt-1">{device.device_type.replace('_', ' ')}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {device.outlet_name && <span>{device.outlet_name}</span>}
                        <span>Last seen: {relativeTime(device.last_seen_at)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Licenses Tab ───────────────────────────────────────────────────── */

function LicensesTab() {
  const { info, status, plan, isActive, isPastDue, isExpired, isLoading, daysUntilExpiry } = useSubscription();
  const statusVariant = isActive ? 'success' : isPastDue ? 'warning' : isExpired ? 'error' : 'outline';
  const statusLabel   = isActive ? (status === 'trial' ? 'Trial' : 'Active') : status ?? 'None';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 py-4">
          <Key className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-tight">POS Subscription License</h3>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <Spinner />
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border bg-accent/10">
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Plan</p>
                  <p className="text-xl font-bold">{info?.planName || plan || 'No active plan'}</p>
                  {info?.planCode && <p className="text-xs font-mono text-muted-foreground">{info.planCode}</p>}
                </div>
                <Badge variant={statusVariant}>{statusLabel}</Badge>
              </div>

              {info?.currentPeriodEnd && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    {isExpired ? 'Expired' : 'Renews'} on {new Date(info.currentPeriodEnd).toLocaleDateString()}
                    {!isExpired && daysUntilExpiry != null && daysUntilExpiry < 30 && (
                      <span className="ml-2 text-amber-500 font-medium">({daysUntilExpiry} days left)</span>
                    )}
                  </span>
                </div>
              )}

              {info?.limits && Object.keys(info.limits).length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Plan Limits</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(info.limits).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card text-sm">
                        <span className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</span>
                        <span className="font-bold">{v === -1 || v === Infinity ? '∞' : String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {info?.features && info.features.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Included Features</p>
                  <div className="flex flex-wrap gap-2">
                    {info.features.map((f) => (
                      <span key={f} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium capitalize">
                        {f.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!isActive && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700">
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    No active POS subscription. Subscribe to unlock device limits and premium features.
                  </p>
                  <a
                    href="https://pricing.codevertexitsolutions.com/plans?service=pos"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-sm font-medium text-amber-700 dark:text-amber-400 underline"
                  >
                    View POS Plans →
                  </a>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Outlet Config Tab ──────────────────────────────────────────────── */

function OutletConfigTab({ tenantID }: { tenantID: string }) {
  const { data: settings, isLoading } = usePOSSettings();
  const updateSettings = useUpdatePOSSettings();

  const [form, setForm] = useState({
    display_mode: 'card',
    show_images: true,
    show_barcode_scanner: false,
    currency: 'KES',
    receipt_header: '',
    receipt_footer: '',
    auto_print_order: false,
    auto_print_kitchen: false,
    printer_type: 'network',
    paper_width: '80mm',
    pin_login_message: '',
    screensaver_url: '',
  });

  useEffect(() => {
    if (settings) {
      setForm({
        display_mode:        settings.display_mode ?? 'card',
        show_images:         settings.show_images ?? true,
        show_barcode_scanner:settings.show_barcode_scanner ?? false,
        currency:            settings.currency ?? 'KES',
        receipt_header:      settings.receipt_header ?? '',
        receipt_footer:      settings.receipt_footer ?? '',
        auto_print_order:    settings.auto_print_order ?? false,
        auto_print_kitchen:  settings.auto_print_kitchen ?? false,
        printer_type:        settings.printer_type ?? 'network',
        paper_width:         settings.paper_width ?? '80mm',
        pin_login_message:   settings.pin_login_message ?? '',
        screensaver_url:     settings.screensaver_url ?? '',
      });
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate(
      {
        display_mode:        form.display_mode,
        show_images:         form.show_images,
        show_barcode_scanner:form.show_barcode_scanner,
        currency:            form.currency,
        receipt_header:      form.receipt_header || null,
        receipt_footer:      form.receipt_footer || null,
        auto_print_order:    form.auto_print_order,
        auto_print_kitchen:  form.auto_print_kitchen,
        printer_type:        form.printer_type,
        paper_width:         form.paper_width,
        pin_login_message:   form.pin_login_message || null,
        screensaver_url:     form.screensaver_url || null,
      },
      {
        onSuccess: () => toast.success('Configuration saved'),
        onError: () => toast.error('Failed to save configuration'),
      }
    );
  };

  if (isLoading) return <Spinner />;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-5 max-w-3xl">
      {/* ── Display ── */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 py-4">
          <Monitor className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-tight">Display</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-4 rounded-xl border border-border bg-accent/10">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Menu Layout</p>
            <div className="grid grid-cols-2 gap-2">
              {([['card', 'Card Grid', LayoutGrid], ['list', 'List View', List]] as const).map(([val, label, Icon]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => set('display_mode', val)}
                  className={cn(
                    'flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all',
                    form.display_mode === val
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/30'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-accent/10">
            <div>
              <p className="text-sm font-medium">Show Item Images</p>
              <p className="text-xs text-muted-foreground">Display product thumbnails in the catalog</p>
            </div>
            <Toggle checked={form.show_images} onChange={(v) => set('show_images', v)} />
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-accent/10">
            <div>
              <p className="text-sm font-medium">Barcode Scanner</p>
              <p className="text-xs text-muted-foreground">Show barcode input field for scan-to-add</p>
            </div>
            <Toggle checked={form.show_barcode_scanner} onChange={(v) => set('show_barcode_scanner', v)} />
          </div>
        </CardContent>
      </Card>

      {/* ── General ── */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 py-4">
          <Globe className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-tight">General</h3>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-xl border border-border bg-accent/10">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Currency</p>
            <select
              value={form.currency}
              onChange={(e) => set('currency', e.target.value)}
              className={inputCls}
            >
              {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'ZAR', 'NGN', 'GHS', 'ETB'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* ── Receipt & Printing ── */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 py-4">
          <Printer className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-tight">Receipt & Printing</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-4 rounded-xl border border-border bg-accent/10">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Receipt Text</p>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Header (e.g. Thank you for your visit!)"
                value={form.receipt_header}
                onChange={(e) => set('receipt_header', e.target.value)}
                className={inputCls}
              />
              <input
                type="text"
                placeholder="Footer (e.g. Come again!)"
                value={form.receipt_footer}
                onChange={(e) => set('receipt_footer', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-accent/10">
            <div>
              <p className="text-sm font-medium">Auto-print Order Receipt</p>
              <p className="text-xs text-muted-foreground">Print a customer receipt on every order</p>
            </div>
            <Toggle checked={form.auto_print_order} onChange={(v) => set('auto_print_order', v)} />
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-accent/10">
            <div>
              <p className="text-sm font-medium">Auto-print Kitchen Chit</p>
              <p className="text-xs text-muted-foreground">Print a kitchen ticket on every order</p>
            </div>
            <Toggle checked={form.auto_print_kitchen} onChange={(v) => set('auto_print_kitchen', v)} />
          </div>
          <div className="p-4 rounded-xl border border-border bg-accent/10">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Printer</p>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={form.printer_type}
                onChange={(e) => set('printer_type', e.target.value)}
                className={inputCls}
              >
                <option value="network">Network</option>
                <option value="bluetooth">Bluetooth</option>
                <option value="usb">USB</option>
                <option value="none">None</option>
              </select>
              <select
                value={form.paper_width}
                onChange={(e) => set('paper_width', e.target.value)}
                className={inputCls}
              >
                <option value="58mm">58mm</option>
                <option value="80mm">80mm</option>
                <option value="A4">A4</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Terminal ── */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 py-4">
          <Tablet className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-tight">Terminal</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-4 rounded-xl border border-border bg-accent/10">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">PIN Login Message</p>
            <input
              type="text"
              placeholder="e.g. Enter your PIN to begin…"
              value={form.pin_login_message}
              onChange={(e) => set('pin_login_message', e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="p-4 rounded-xl border border-border bg-accent/10">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Screensaver URL</p>
            <input
              type="url"
              placeholder="https://…"
              value={form.screensaver_url}
              onChange={(e) => set('screensaver_url', e.target.value)}
              className={inputCls}
            />
            <p className="text-xs text-muted-foreground mt-1.5">Image or video URL shown on idle terminal</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pb-2">
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {updateSettings.isPending ? 'Saving…' : 'Save Configuration'}
        </Button>
      </div>
    </div>
  );
}

/* ─── KDS Stations Tab ───────────────────────────────────────────────── */

function KDSTab({ tenantID }: { tenantID: string }) {
  const qc = useQueryClient();
  const { data: settings, isLoading: settingsLoading } = usePOSSettings();
  const [newName, setNewName] = useState('');

  const useCase = (settings?.use_case ?? '').toLowerCase();
  const isKdsCompatible = !useCase || ['hospitality', 'quick_service'].includes(useCase);

  const { data, isLoading } = useQuery<{ data: KdsStation[]; total: number }>({
    queryKey: ['kds-stations', tenantID],
    queryFn: () => apiClient.get(`/api/v1/${tenantID}/pos/kds/stations`),
    enabled: !!tenantID && isKdsCompatible,
    staleTime: 30_000,
    retry: false,
  });

  const createStation = useMutation({
    mutationFn: (name: string) => apiClient.post(`/api/v1/${tenantID}/pos/kds/stations`, { name }),
    onSuccess: () => { toast.success('Station created'); setNewName(''); qc.invalidateQueries({ queryKey: ['kds-stations', tenantID] }); },
    onError: () => toast.error('Failed to create station'),
  });

  const deleteStation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/${tenantID}/pos/kds/stations/${id}`),
    onSuccess: () => { toast.success('Station removed'); qc.invalidateQueries({ queryKey: ['kds-stations', tenantID] }); },
    onError: () => toast.error('Failed to remove station'),
  });

  const stations = data?.data ?? [];

  if (settingsLoading) return <Spinner />;

  return (
    <div className="space-y-5 max-w-2xl">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 py-4">
          <ChefHat className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-tight">KDS Stations</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isKdsCompatible ? (
            <div className="p-4 rounded-xl border border-border bg-accent/10">
              <p className="text-sm font-medium mb-1">KDS is for hospitality outlets</p>
              <p className="text-xs text-muted-foreground">
                Kitchen Display System is available for <strong>Hospitality</strong> and{' '}
                <strong>Quick Service</strong> outlets. This outlet is configured as{' '}
                <strong className="capitalize">{useCase.replace('_', ' ') || 'unknown'}</strong>.
                Update the outlet use case in the Outlet Config tab to enable KDS.
              </p>
            </div>
          ) : (
            <>
              {/* Add Station */}
              <div className="p-4 rounded-xl border border-border bg-accent/10">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Add Station</p>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && newName.trim() && createStation.mutate(newName.trim())}
                    placeholder="e.g. Kitchen, Bar, Grill"
                    className={cn(inputCls, 'flex-1')}
                  />
                  <Button
                    size="sm"
                    onClick={() => { if (newName.trim()) createStation.mutate(newName.trim()); }}
                    disabled={!newName.trim() || createStation.isPending}
                    className="gap-2 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
              </div>

              {/* Station List */}
              {isLoading ? (
                <Spinner />
              ) : stations.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <ChefHat className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No KDS stations configured yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {stations.map((station) => (
                    <div
                      key={station.id}
                      className="flex items-center justify-between p-4 rounded-xl border border-border bg-accent/10"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                          station.is_active ? 'bg-green-500/10 text-green-500' : 'bg-muted/50 text-muted-foreground'
                        )}>
                          <ChefHat className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{station.name}</p>
                          {station.categories?.length > 0 && (
                            <p className="text-xs text-muted-foreground">{station.categories.join(', ')}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={station.is_active ? 'success' : 'outline'}>
                          {station.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <button
                          onClick={() => {
                            if (!window.confirm(`Delete station "${station.name}"? Historical ticket data will be preserved.`)) return;
                            deleteStation.mutate(station.id);
                          }}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete station"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Tax & VAT Tab ──────────────────────────────────────────────────── */

function TaxTab({ tenantID }: { tenantID: string }) {
  const { data: settings, isLoading } = usePOSSettings();
  const updateSettings = useUpdatePOSSettings();

  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState(16);
  const [currency, setCurrency] = useState('KES');

  useEffect(() => {
    if (settings) {
      setVatEnabled(settings.vat_enabled ?? false);
      setVatRate(settings.vat_rate ?? 16);
      setCurrency(settings.currency ?? 'KES');
    }
  }, [settings]);

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-5 max-w-2xl">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 py-4">
          <Grid3X3 className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-tight">Tax & VAT</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-accent/10">
            <div>
              <p className="text-sm font-medium">Enable VAT</p>
              <p className="text-xs text-muted-foreground">Apply VAT to all orders at checkout</p>
            </div>
            <Toggle checked={vatEnabled} onChange={setVatEnabled} />
          </div>

          {vatEnabled && (
            <div className="p-4 rounded-xl border border-border bg-accent/10">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">VAT Rate (%)</p>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={vatRate}
                onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
                className={inputCls}
              />
              <p className="text-xs text-muted-foreground mt-1.5">Standard VAT in Kenya is 16%. Adjust if your sector has a different rate.</p>
            </div>
          )}

          <div className="p-4 rounded-xl border border-border bg-accent/10">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Currency</p>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputCls}
            >
              {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'ZAR', 'NGN', 'GHS', 'ETB'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => updateSettings.mutate({ vat_enabled: vatEnabled, vat_rate: vatRate, currency }, {
                onSuccess: () => toast.success('Tax settings saved'),
                onError: () => toast.error('Failed to save'),
              })}
              disabled={updateSettings.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {updateSettings.isPending ? 'Saving…' : 'Save Tax Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Modules Tab ────────────────────────────────────────────────────── */

function ModulesTab({ tenantID }: { tenantID: string }) {
  const { data: settings, isLoading } = usePOSSettings();
  const updateModules = useUpdatePOSModules();

  const useCase = (settings?.use_case ?? '').toLowerCase();

  const moduleList = (
    [
      {
        key: 'enable_kds' as const,
        label: 'Kitchen Display System (KDS)',
        desc: 'Route orders to kitchen screens in real time',
        icon: ChefHat,
        useCases: ['hospitality', 'quick_service'],
      },
      {
        key: 'enable_appointments' as const,
        label: 'Appointments',
        desc: 'Enable appointment booking for services',
        icon: CalendarCheck,
        useCases: ['hospitality', 'services'],
      },
      {
        key: 'hotel_module_enabled' as const,
        label: 'Hotel Module',
        desc: 'Room management, check-in/out, and folios',
        icon: Hotel,
        useCases: ['hospitality'],
      },
      {
        key: 'layaway_enabled' as const,
        label: 'Layaway Plans',
        desc: 'Allow customers to pay for items over time',
        icon: Warehouse,
        useCases: ['retail', 'services'],
      },
      {
        key: 'shift_reports_enabled' as const,
        label: 'Shift Reports',
        desc: 'Cash drawer history and daily closing reports',
        icon: CreditCard,
        useCases: [] as string[],
      },
    ] as const
  ).filter((m) => !useCase || m.useCases.length === 0 || (m.useCases as readonly string[]).includes(useCase));

  const [form, setForm] = useState({
    enable_kds:            false,
    enable_appointments:   false,
    hotel_module_enabled:  false,
    layaway_enabled:       false,
    shift_reports_enabled: false,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        enable_kds:            settings.enable_kds ?? false,
        enable_appointments:   settings.enable_appointments ?? false,
        hotel_module_enabled:  settings.hotel_module_enabled ?? false,
        layaway_enabled:       settings.layaway_enabled ?? false,
        shift_reports_enabled: settings.shift_reports_enabled ?? false,
      });
    }
  }, [settings]);

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-5 max-w-2xl">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 py-4">
          <LayoutGrid className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-tight">Feature Modules</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          {useCase && (
            <p className="text-xs text-muted-foreground pb-1">
              Showing modules for{' '}
              <strong className="capitalize text-foreground">{useCase.replace('_', ' ')}</strong> outlet.
              Some modules are hidden because they do not apply to this outlet type.
            </p>
          )}

          {moduleList.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <LayoutGrid className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No configurable modules for this outlet type.</p>
            </div>
          ) : (
            moduleList.map((mod) => {
              const ModIcon = mod.icon;
              const enabled = form[mod.key];
              return (
                <div
                  key={mod.key}
                  className="flex items-center justify-between p-4 rounded-xl border border-border bg-accent/10"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                      enabled ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground'
                    )}>
                      <ModIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{mod.label}</p>
                      <p className="text-xs text-muted-foreground">{mod.desc}</p>
                    </div>
                  </div>
                  <Toggle
                    checked={enabled}
                    onChange={(v) => setForm((f) => ({ ...f, [mod.key]: v }))}
                  />
                </div>
              );
            })
          )}

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => updateModules.mutate(form, {
                onSuccess: () => toast.success('Module settings saved'),
                onError: () => toast.error('Failed to save'),
              })}
              disabled={updateModules.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {updateModules.isPending ? 'Saving…' : 'Save Modules'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
