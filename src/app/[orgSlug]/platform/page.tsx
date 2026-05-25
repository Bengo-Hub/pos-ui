'use client';

import { useAuthStore } from '@/store/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { usePOSSettings, useUpdatePOSSettings, useUpdatePOSModules } from '@/hooks/usePOSSettings';
import { useSubscription } from '@/hooks/use-subscription';
import { apiClient } from '@/lib/api/client';
import { Badge, Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Barcode,
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
  ToggleLeft,
  ToggleRight,
  Trash2,
  UtensilsCrossed,
  Warehouse,
} from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function PlatformPage() {
  const user = useAuthStore((state) => state.user);
  const tenantID = user?.tenant_id ?? '';
  const { isSuperuser } = usePermissions();
  const router = useRouter();
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const searchParams = useSearchParams();

  const initialTab = (searchParams?.get('tab') as TabKey | null) ?? 'devices';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    if (user && !isSuperuser) {
      router.replace(`/${orgSlug}/unauthorized`);
    }
  }, [user, isSuperuser, orgSlug, router]);

  if (!user || !isSuperuser) {
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
    { key: 'devices',  label: 'Devices',      icon: Monitor },
    { key: 'licenses', label: 'Licenses',      icon: Key },
    { key: 'outlet',   label: 'Outlet Config', icon: Settings },
    { key: 'kds',      label: 'KDS Stations',  icon: ChefHat },
    { key: 'tax',      label: 'Tax & VAT',     icon: Grid3X3 },
    { key: 'modules',  label: 'Modules',       icon: ToggleLeft },
  ];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="warning">Platform Admin</Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Platform Management</h1>
        <p className="text-muted-foreground mt-1">Device provisioning, licensing, outlet config, and module management.</p>
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
    terminal:     Monitor,
    web_terminal: Monitor,
    tablet:       Tablet,
    mobile:       Smartphone,
  };

  const statusVariant = (s: string) =>
    s === 'active' ? 'success' : s === 'pending' ? 'warning' : 'outline';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? '…' : `${devices.length} device${devices.length !== 1 ? 's' : ''} registered`}
        </p>
        <Button size="sm" className="gap-2" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
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
                      device.status === 'active'   ? 'bg-green-500/10 text-green-500' :
                      device.status === 'pending'  ? 'bg-amber-500/10 text-amber-500' :
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
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border bg-accent/10">
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Plan</p>
                  <p className="text-xl font-bold">{info?.planName || plan || 'No active plan'}</p>
                  {info?.planCode && (
                    <p className="text-xs font-mono text-muted-foreground">{info.planCode}</p>
                  )}
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
    currency: 'KES',
    vat_enabled: false,
    vat_rate: 16,
    receipt_header: '',
    receipt_footer: '',
    auto_print_order: false,
    auto_print_kitchen: false,
    printer_type: 'network',
    paper_width: '80mm',
  });

  useEffect(() => {
    if (settings) {
      setForm({
        display_mode:       settings.display_mode ?? 'card',
        currency:           settings.currency ?? 'KES',
        vat_enabled:        settings.vat_enabled ?? false,
        vat_rate:           settings.vat_rate ?? 16,
        receipt_header:     settings.receipt_header ?? '',
        receipt_footer:     settings.receipt_footer ?? '',
        auto_print_order:   settings.auto_print_order ?? false,
        auto_print_kitchen: settings.auto_print_kitchen ?? false,
        printer_type:       settings.printer_type ?? 'network',
        paper_width:        settings.paper_width ?? '80mm',
      });
    }
  }, [settings]);

  const displayModes = [
    { value: 'list',       label: 'List',       icon: List },
    { value: 'card',       label: 'Card',       icon: LayoutGrid },
  ] as const;

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Outlet Configuration</h2>
          </div>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateSettings.mutate({
                display_mode:       form.display_mode as any,
                currency:           form.currency,
                vat_enabled:        form.vat_enabled,
                vat_rate:           form.vat_rate,
                receipt_header:     form.receipt_header || null,
                receipt_footer:     form.receipt_footer || null,
                auto_print_order:   form.auto_print_order,
                auto_print_kitchen: form.auto_print_kitchen,
                printer_type:       form.printer_type,
                paper_width:        form.paper_width,
              });
            }}
            className="space-y-6"
          >
            {/* Display Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Menu Display Mode</label>
              <div className="grid grid-cols-2 gap-3">
                {displayModes.map((dm) => {
                  const DMIcon = dm.icon;
                  return (
                    <button
                      key={dm.value}
                      type="button"
                      onClick={() => setForm({ ...form, display_mode: dm.value })}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-all',
                        form.display_mode === dm.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/30'
                      )}
                    >
                      <DMIcon className="h-6 w-6" />
                      {dm.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Currency */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><Globe className="h-4 w-4" /> Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full rounded-lg border border-input bg-transparent px-4 py-2 text-sm focus:ring-1 focus:ring-ring focus:outline-none"
              >
                {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'ZAR', 'NGN', 'GHS', 'ETB'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Receipt */}
            <div className="space-y-3">
              <label className="text-sm font-medium flex items-center gap-2"><Printer className="h-4 w-4" /> Receipt</label>
              <input
                type="text"
                placeholder="Receipt header (e.g. Thank you for your visit!)"
                value={form.receipt_header}
                onChange={(e) => setForm({ ...form, receipt_header: e.target.value })}
                className="w-full rounded-lg border border-input bg-transparent px-4 py-2 text-sm focus:ring-1 focus:ring-ring focus:outline-none placeholder:text-muted-foreground"
              />
              <input
                type="text"
                placeholder="Receipt footer (e.g. Come again!)"
                value={form.receipt_footer}
                onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
                className="w-full rounded-lg border border-input bg-transparent px-4 py-2 text-sm focus:ring-1 focus:ring-ring focus:outline-none placeholder:text-muted-foreground"
              />
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.auto_print_order} onChange={(e) => setForm({ ...form, auto_print_order: e.target.checked })} className="rounded" />
                  Auto-print order receipt
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.auto_print_kitchen} onChange={(e) => setForm({ ...form, auto_print_kitchen: e.target.checked })} className="rounded" />
                  Auto-print kitchen chit
                </label>
              </div>
              <div className="flex gap-3">
                <select
                  value={form.printer_type}
                  onChange={(e) => setForm({ ...form, printer_type: e.target.value })}
                  className="flex-1 rounded-lg border border-input bg-transparent px-4 py-2 text-sm focus:ring-1 focus:ring-ring focus:outline-none"
                >
                  <option value="network">Network Printer</option>
                  <option value="bluetooth">Bluetooth Printer</option>
                  <option value="usb">USB Printer</option>
                  <option value="none">No Printer</option>
                </select>
                <select
                  value={form.paper_width}
                  onChange={(e) => setForm({ ...form, paper_width: e.target.value })}
                  className="w-32 rounded-lg border border-input bg-transparent px-4 py-2 text-sm focus:ring-1 focus:ring-ring focus:outline-none"
                >
                  <option value="58mm">58mm</option>
                  <option value="80mm">80mm</option>
                  <option value="A4">A4</option>
                </select>
              </div>
            </div>

            <Button type="submit" disabled={updateSettings.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {updateSettings.isPending ? 'Saving…' : 'Save Outlet Config'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── KDS Stations Tab ───────────────────────────────────────────────── */

function KDSTab({ tenantID }: { tenantID: string }) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');

  const { data, isLoading, error } = useQuery<{ data: KdsStation[]; total: number }>({
    queryKey: ['kds-stations', tenantID],
    queryFn: () => apiClient.get(`/api/v1/${tenantID}/pos/kds/stations`),
    enabled: !!tenantID,
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

  const is403 = (error as any)?.response?.status === 403;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">KDS Stations</h2>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {is403 ? (
            <div className="py-8 text-center text-muted-foreground">
              <ChefHat className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">KDS is only available for hospitality and quick service outlets.</p>
              <p className="text-xs mt-1 text-muted-foreground">Enable KDS in the Modules tab and ensure your outlet is configured for hospitality or quick service.</p>
            </div>
          ) : (
            <>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New station name (e.g. Kitchen, Bar)"
                  className="flex-1 rounded-lg border border-input bg-transparent px-4 py-2 text-sm focus:ring-1 focus:ring-ring focus:outline-none placeholder:text-muted-foreground"
                />
                <Button
                  size="sm"
                  onClick={() => { if (newName.trim()) createStation.mutate(newName.trim()); }}
                  disabled={!newName.trim() || createStation.isPending}
                  className="gap-2"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : stations.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <ChefHat className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No KDS stations configured yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border">
                  {stations.map((station) => (
                    <div key={station.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'h-9 w-9 rounded-lg flex items-center justify-center',
                          station.is_active ? 'bg-green-500/10 text-green-500' : 'bg-accent/30 text-muted-foreground'
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
                      <div className="flex items-center gap-2">
                        <Badge variant={station.is_active ? 'success' : 'outline'}>
                          {station.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <button
                          onClick={() => {
                            if (!window.confirm(`Permanently delete station "${station.name}"?\n\nHistorical ticket data will be preserved but this station will no longer receive tickets.`)) return;
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

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Grid3X3 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Tax & VAT Configuration</h2>
          </div>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateSettings.mutate({ vat_enabled: vatEnabled, vat_rate: vatRate, currency });
            }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div>
                <p className="text-sm font-medium">Enable VAT</p>
                <p className="text-xs text-muted-foreground mt-0.5">Apply VAT to all orders</p>
              </div>
              <div>
                {vatEnabled ? (
                  <ToggleRight className="h-7 w-7 text-primary cursor-pointer" onClick={() => setVatEnabled(false)} />
                ) : (
                  <ToggleLeft className="h-7 w-7 text-muted-foreground cursor-pointer" onClick={() => setVatEnabled(true)} />
                )}
              </div>
            </div>

            {vatEnabled && (
              <div className="space-y-2">
                <label className="text-sm font-medium">VAT Rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={vatRate}
                  onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg border border-input bg-transparent px-4 py-2 text-sm focus:ring-1 focus:ring-ring focus:outline-none"
                />
                <p className="text-xs text-muted-foreground">Standard VAT in Kenya is 16%. Adjust if your sector has a different rate.</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border border-input bg-transparent px-4 py-2 text-sm focus:ring-1 focus:ring-ring focus:outline-none"
              >
                {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'ZAR', 'NGN', 'GHS', 'ETB'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <Button type="submit" disabled={updateSettings.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {updateSettings.isPending ? 'Saving…' : 'Save Tax Settings'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Modules Tab ────────────────────────────────────────────────────── */

function ModulesTab({ tenantID }: { tenantID: string }) {
  const { data: settings, isLoading } = usePOSSettings();
  const updateModules = useUpdatePOSModules();

  const [form, setForm] = useState({
    enable_kds:          false,
    enable_appointments: false,
    hotel_module_enabled: false,
    layaway_enabled:     false,
    shift_reports_enabled: false,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        enable_kds:           settings.enable_kds ?? false,
        enable_appointments:  settings.enable_appointments ?? false,
        hotel_module_enabled: settings.hotel_module_enabled ?? false,
        layaway_enabled:      settings.layaway_enabled ?? false,
        shift_reports_enabled: settings.shift_reports_enabled ?? false,
      });
    }
  }, [settings]);

  const moduleList = [
    { key: 'enable_kds'           as const, label: 'Kitchen Display System (KDS)',    desc: 'Route orders to kitchen screens',           icon: ChefHat },
    { key: 'enable_appointments'  as const, label: 'Appointments',                    desc: 'Enable appointment booking for services',   icon: CalendarCheck },
    { key: 'hotel_module_enabled' as const, label: 'Hotel Module',                    desc: 'Room management, check-in/out, folios',     icon: Hotel },
    { key: 'layaway_enabled'      as const, label: 'Layaway Plans',                   desc: 'Allow customers to pay for items over time', icon: Warehouse },
    { key: 'shift_reports_enabled'as const, label: 'Shift Reports',                   desc: 'Drawer history, daily closing reports',     icon: CreditCard },
  ] as const;

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ToggleLeft className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Module Toggles</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Enable or disable feature modules for this outlet.</p>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateModules.mutate(form);
            }}
            className="space-y-3"
          >
            {moduleList.map((mod) => {
              const ModIcon = mod.icon;
              const enabled = form[mod.key];
              return (
                <label
                  key={mod.key}
                  className={cn(
                    'flex items-center gap-4 rounded-lg border p-4 cursor-pointer transition-all',
                    enabled ? 'border-primary/30 bg-primary/5' : 'border-border'
                  )}
                >
                  <div className={cn(
                    'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                    enabled ? 'bg-primary/10 text-primary' : 'bg-accent/30 text-muted-foreground'
                  )}>
                    <ModIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{mod.label}</p>
                    <p className="text-xs text-muted-foreground">{mod.desc}</p>
                  </div>
                  <div className="relative shrink-0" onClick={(e) => { e.preventDefault(); setForm({ ...form, [mod.key]: !enabled }); }}>
                    {enabled ? (
                      <ToggleRight className="h-7 w-7 text-primary" />
                    ) : (
                      <ToggleLeft className="h-7 w-7 text-muted-foreground" />
                    )}
                  </div>
                </label>
              );
            })}

            <div className="pt-2">
              <Button type="submit" disabled={updateModules.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateModules.isPending ? 'Saving…' : 'Save Module Config'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
