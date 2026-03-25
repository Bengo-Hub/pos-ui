'use client';

import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/api/client';
import { Badge, Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Barcode,
  CalendarCheck,
  ChefHat,
  Grid3X3,
  Key,
  LayoutGrid,
  List,
  Monitor,
  Image as ImageIcon,
  Plus,
  Save,
  Settings,
  Shield,
  Smartphone,
  Tablet,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/* ─── Types ──────────────────────────────────────────────────────────── */

interface Device {
  id: string;
  name: string;
  type: 'tablet' | 'terminal' | 'mobile';
  serialNumber: string;
  status: 'active' | 'inactive' | 'pending';
  lastSeen: string;
  location: string;
}

interface License {
  id: string;
  key: string;
  plan: string;
  devices: number;
  maxDevices: number;
  expiresAt: string;
  status: 'active' | 'expired' | 'trial';
}

interface OutletConfig {
  useCase: string;
  displayMode: 'list' | 'card' | 'image_grid';
}

interface KdsStation {
  id: string;
  name: string;
  categories: string[];
  active: boolean;
}

interface TaxRate {
  id: string;
  name: string;
  rate: number;
  isDefault: boolean;
}

interface ModuleToggles {
  kds: boolean;
  appointments: boolean;
  barcode: boolean;
  tables: boolean;
}

/* ─── Mock Data ──────────────────────────────────────────────────────── */

const mockDevices: Device[] = [
  { id: '1', name: 'Front Counter iPad', type: 'tablet', serialNumber: 'SN-TAB-001', status: 'active', lastSeen: '2 min ago', location: 'Main Counter' },
  { id: '2', name: 'Bar Terminal', type: 'terminal', serialNumber: 'SN-TRM-002', status: 'active', lastSeen: '5 min ago', location: 'Bar Area' },
  { id: '3', name: 'Server Mobile #1', type: 'mobile', serialNumber: 'SN-MOB-003', status: 'active', lastSeen: '1 min ago', location: 'Floor' },
  { id: '4', name: 'Kitchen Display', type: 'tablet', serialNumber: 'SN-TAB-004', status: 'inactive', lastSeen: '2 hours ago', location: 'Kitchen' },
  { id: '5', name: 'Server Mobile #2', type: 'mobile', serialNumber: 'SN-MOB-005', status: 'pending', lastSeen: '-', location: 'Unassigned' },
];

const mockLicenses: License[] = [
  { id: '1', key: 'LIC-PRO-2026-XXXX', plan: 'Professional', devices: 3, maxDevices: 5, expiresAt: '2027-03-06', status: 'active' },
  { id: '2', key: 'LIC-TRIAL-2026-YYYY', plan: 'Trial', devices: 1, maxDevices: 2, expiresAt: '2026-04-06', status: 'trial' },
];

type TabKey = 'devices' | 'licenses' | 'outlet' | 'kds' | 'tax' | 'modules';

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function PlatformPage() {
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('devices');

  useEffect(() => {
    if (user && !user.roles?.includes('super_admin')) {
      router.replace(`/${orgSlug}/unauthorized`);
    }
  }, [user, orgSlug, router]);

  /* ── Outlet Config ────────────────────────────────────────────────── */

  const { data: outletConfig } = useQuery<OutletConfig>({
    queryKey: ['platform', 'outlet-config', orgSlug],
    queryFn: () => apiClient.get('/api/v1/platform/outlet-config'),
    enabled: !!user?.roles?.includes('super_admin'),
    placeholderData: { useCase: 'restaurant', displayMode: 'card' },
  });

  const [outletForm, setOutletForm] = useState<OutletConfig>({ useCase: 'restaurant', displayMode: 'card' });
  useEffect(() => { if (outletConfig) setOutletForm(outletConfig); }, [outletConfig]);

  const outletMutation = useMutation({
    mutationFn: (payload: OutletConfig) => apiClient.put('/api/v1/platform/outlet-config', payload),
    onSuccess: () => { toast.success('Outlet config saved'); queryClient.invalidateQueries({ queryKey: ['platform', 'outlet-config'] }); },
    onError: () => toast.error('Failed to save outlet config'),
  });

  /* ── KDS Stations ─────────────────────────────────────────────────── */

  const { data: kdsStations } = useQuery<KdsStation[]>({
    queryKey: ['platform', 'kds-stations', orgSlug],
    queryFn: () => apiClient.get('/api/v1/platform/kds-stations'),
    enabled: !!user?.roles?.includes('super_admin'),
    placeholderData: [],
  });

  const [newStationName, setNewStationName] = useState('');

  const createKds = useMutation({
    mutationFn: (name: string) => apiClient.post('/api/v1/platform/kds-stations', { name }),
    onSuccess: () => { toast.success('Station created'); setNewStationName(''); queryClient.invalidateQueries({ queryKey: ['platform', 'kds-stations'] }); },
    onError: () => toast.error('Failed to create station'),
  });

  const deleteKds = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/platform/kds-stations/${id}`),
    onSuccess: () => { toast.success('Station deleted'); queryClient.invalidateQueries({ queryKey: ['platform', 'kds-stations'] }); },
    onError: () => toast.error('Failed to delete station'),
  });

  /* ── Tax Rates ────────────────────────────────────────────────────── */

  const { data: taxRates } = useQuery<TaxRate[]>({
    queryKey: ['platform', 'tax-rates', orgSlug],
    queryFn: () => apiClient.get('/api/v1/platform/tax-rates'),
    enabled: !!user?.roles?.includes('super_admin'),
    placeholderData: [],
  });

  /* ── Module Toggles ───────────────────────────────────────────────── */

  const { data: modules } = useQuery<ModuleToggles>({
    queryKey: ['platform', 'modules', orgSlug],
    queryFn: () => apiClient.get('/api/v1/platform/modules'),
    enabled: !!user?.roles?.includes('super_admin'),
    placeholderData: { kds: true, appointments: false, barcode: false, tables: false },
  });

  const [moduleForm, setModuleForm] = useState<ModuleToggles>({ kds: true, appointments: false, barcode: false, tables: false });
  useEffect(() => { if (modules) setModuleForm(modules); }, [modules]);

  const moduleMutation = useMutation({
    mutationFn: (payload: ModuleToggles) => apiClient.put('/api/v1/platform/modules', payload),
    onSuccess: () => { toast.success('Module toggles saved'); queryClient.invalidateQueries({ queryKey: ['platform', 'modules'] }); },
    onError: () => toast.error('Failed to save module toggles'),
  });

  /* ── Guard ────────────────────────────────────────────────────────── */

  if (!user?.roles?.includes('super_admin')) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto opacity-30" />
          <p className="text-sm text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    );
  }

  const deviceIcons = {
    tablet: Tablet,
    terminal: Monitor,
    mobile: Smartphone,
  };

  const useCases = ['restaurant', 'retail', 'grocery', 'pharmacy', 'salon', 'general'];
  const displayModes: { value: OutletConfig['displayMode']; label: string; icon: typeof List }[] = [
    { value: 'list', label: 'List', icon: List },
    { value: 'card', label: 'Card', icon: LayoutGrid },
    { value: 'image_grid', label: 'Image Grid', icon: ImageIcon },
  ];

  const tabs: { key: TabKey; label: string; icon: typeof Monitor }[] = [
    { key: 'devices', label: 'Devices', icon: Monitor },
    { key: 'licenses', label: 'Licenses', icon: Key },
    { key: 'outlet', label: 'Outlet Config', icon: Settings },
    { key: 'kds', label: 'KDS Stations', icon: ChefHat },
    { key: 'tax', label: 'Tax Rates', icon: Grid3X3 },
    { key: 'modules', label: 'Modules', icon: ToggleLeft },
  ];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="warning">Platform Admin</Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Management</h1>
          <p className="text-muted-foreground mt-1">Device provisioning, licensing, outlet config, and module management.</p>
        </div>
      </div>

      {/* ─── Tab Bar ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap bg-accent/30 p-1 rounded-lg w-fit gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all",
                activeTab === tab.key
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 inline mr-1.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── Devices Tab ───────────────────────────────────────────── */}
      {activeTab === 'devices' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{mockDevices.length} devices registered</p>
            <Button size="sm" className="gap-2">
              <Plus className="h-3.5 w-3.5" /> Provision Device
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mockDevices.map((device) => {
              const DeviceIcon = deviceIcons[device.type];
              return (
                <Card key={device.id} className="hover:border-primary/30 transition-all">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "h-12 w-12 rounded-xl flex items-center justify-center border border-border",
                        device.status === 'active' ? "bg-green-500/10 text-green-500" :
                          device.status === 'pending' ? "bg-amber-500/10 text-amber-500" : "bg-accent/30 text-muted-foreground"
                      )}>
                        <DeviceIcon className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm">{device.name}</h4>
                          <Badge variant={device.status === 'active' ? 'success' : device.status === 'pending' ? 'warning' : 'outline'}>
                            {device.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mt-1">{device.serialNumber}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>{device.location}</span>
                          <span>&middot;</span>
                          <span>Last seen: {device.lastSeen}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Licenses Tab ──────────────────────────────────────────── */}
      {activeTab === 'licenses' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-primary" />
                <h3 className="font-bold text-sm uppercase tracking-tight">License Keys</h3>
              </div>
              <Button size="sm" className="gap-2">
                <Plus className="h-3.5 w-3.5" /> Add License
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-accent/5">
                      <th className="text-left px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Key</th>
                      <th className="text-left px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Plan</th>
                      <th className="text-center px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Devices</th>
                      <th className="text-right px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Expires</th>
                      <th className="text-center px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {mockLicenses.map((lic) => (
                      <tr key={lic.id} className="hover:bg-accent/5 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs font-bold">{lic.key}</td>
                        <td className="px-6 py-4 text-xs font-medium">{lic.plan}</td>
                        <td className="px-6 py-4 text-center text-xs">{lic.devices} / {lic.maxDevices}</td>
                        <td className="px-6 py-4 text-right text-xs text-muted-foreground">{lic.expiresAt}</td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant={lic.status === 'active' ? 'success' : lic.status === 'trial' ? 'warning' : 'error'}>
                            {lic.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Outlet Config Tab ─────────────────────────────────────── */}
      {activeTab === 'outlet' && (
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
                onSubmit={(e) => { e.preventDefault(); outletMutation.mutate(outletForm); }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium">Use-Case</label>
                  <select
                    value={outletForm.useCase}
                    onChange={(e) => setOutletForm({ ...outletForm, useCase: e.target.value })}
                    className="w-full rounded-lg border border-input bg-transparent px-4 py-2 text-sm focus:ring-1 focus:ring-ring focus:outline-none"
                  >
                    {useCases.map((uc) => (
                      <option key={uc} value={uc} className="capitalize">{uc}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">Determines menu layout, order flow, and checkout behavior.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Display Mode</label>
                  <div className="grid grid-cols-3 gap-3">
                    {displayModes.map((dm) => {
                      const DMIcon = dm.icon;
                      return (
                        <button
                          key={dm.value}
                          type="button"
                          onClick={() => setOutletForm({ ...outletForm, displayMode: dm.value })}
                          className={cn(
                            "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-all",
                            outletForm.displayMode === dm.value
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/30"
                          )}
                        >
                          <DMIcon className="h-6 w-6" />
                          {dm.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Button type="submit" disabled={outletMutation.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  {outletMutation.isPending ? 'Saving...' : 'Save Outlet Config'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── KDS Stations Tab ──────────────────────────────────────── */}
      {activeTab === 'kds' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <div className="flex items-center gap-2">
                <ChefHat className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">KDS Stations</h2>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newStationName}
                  onChange={(e) => setNewStationName(e.target.value)}
                  placeholder="New station name..."
                  className="flex-1 rounded-lg border border-input bg-transparent px-4 py-2 text-sm focus:ring-1 focus:ring-ring focus:outline-none placeholder:text-muted-foreground"
                />
                <Button
                  size="sm"
                  onClick={() => { if (newStationName.trim()) createKds.mutate(newStationName.trim()); }}
                  disabled={!newStationName.trim() || createKds.isPending}
                  className="gap-2"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Station
                </Button>
              </div>

              {(kdsStations?.length ?? 0) === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <ChefHat className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No KDS stations configured yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border">
                  {kdsStations?.map((station) => (
                    <div key={station.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-9 w-9 rounded-lg flex items-center justify-center",
                          station.active ? "bg-green-500/10 text-green-500" : "bg-accent/30 text-muted-foreground"
                        )}>
                          <ChefHat className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{station.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {station.categories.length > 0 ? station.categories.join(', ') : 'All categories'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={station.active ? 'success' : 'outline'}>
                          {station.active ? 'Active' : 'Inactive'}
                        </Badge>
                        <button
                          onClick={() => deleteKds.mutate(station.id)}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Tax Rates Tab ─────────────────────────────────────────── */}
      {activeTab === 'tax' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <div className="flex items-center gap-2">
                <Grid3X3 className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Tax Rates</h2>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(taxRates?.length ?? 0) === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <p className="text-sm">No tax rates configured. Set up tax rates via the backend admin API.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-accent/5">
                        <th className="text-left px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Name</th>
                        <th className="text-right px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Rate</th>
                        <th className="text-center px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Default</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {taxRates?.map((tax) => (
                        <tr key={tax.id} className="hover:bg-accent/5 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium">{tax.name}</td>
                          <td className="px-6 py-4 text-right text-sm font-mono">{tax.rate}%</td>
                          <td className="px-6 py-4 text-center">
                            {tax.isDefault && <Badge variant="success">Default</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Module Toggles Tab ────────────────────────────────────── */}
      {activeTab === 'modules' && (
        <div className="space-y-6 max-w-2xl">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ToggleLeft className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Module Toggles</h2>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Enable or disable modules per outlet.</p>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => { e.preventDefault(); moduleMutation.mutate(moduleForm); }}
                className="space-y-4"
              >
                {([
                  { key: 'kds' as const, label: 'Kitchen Display System (KDS)', desc: 'Route orders to kitchen stations', icon: ChefHat },
                  { key: 'appointments' as const, label: 'Appointments', desc: 'Enable appointment booking for services', icon: CalendarCheck },
                  { key: 'barcode' as const, label: 'Barcode Scanner', desc: 'Scan barcodes for quick item lookup', icon: Barcode },
                  { key: 'tables' as const, label: 'Table Management', desc: 'Assign orders to table numbers', icon: UtensilsCrossed },
                ]).map((mod) => {
                  const ModIcon = mod.icon;
                  const enabled = moduleForm[mod.key];
                  return (
                    <label
                      key={mod.key}
                      className={cn(
                        "flex items-center gap-4 rounded-lg border p-4 cursor-pointer transition-all",
                        enabled ? "border-primary/30 bg-primary/5" : "border-border"
                      )}
                    >
                      <div className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center",
                        enabled ? "bg-primary/10 text-primary" : "bg-accent/30 text-muted-foreground"
                      )}>
                        <ModIcon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{mod.label}</p>
                        <p className="text-xs text-muted-foreground">{mod.desc}</p>
                      </div>
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => setModuleForm({ ...moduleForm, [mod.key]: e.target.checked })}
                          className="sr-only peer"
                        />
                        {enabled ? (
                          <ToggleRight className="h-7 w-7 text-primary" onClick={() => setModuleForm({ ...moduleForm, [mod.key]: false })} />
                        ) : (
                          <ToggleLeft className="h-7 w-7 text-muted-foreground" onClick={() => setModuleForm({ ...moduleForm, [mod.key]: true })} />
                        )}
                      </div>
                    </label>
                  );
                })}

                <Button type="submit" disabled={moduleMutation.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  {moduleMutation.isPending ? 'Saving...' : 'Save Module Config'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
