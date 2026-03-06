'use client';

import { useAuthStore } from '@/store/auth';
import { Badge, Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import {
  Key,
  Monitor,
  Plus,
  Save,
  Shield,
  Smartphone,
  Tablet
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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

export default function PlatformPage() {
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const [activeTab, setActiveTab] = useState<'devices' | 'licenses'>('devices');

  useEffect(() => {
    if (user && !user.roles?.includes('super_admin')) {
      router.replace(`/${orgSlug}/unauthorized`);
    }
  }, [user, orgSlug, router]);

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

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="warning">Platform Admin</Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Management</h1>
          <p className="text-muted-foreground mt-1">Device provisioning and license management.</p>
        </div>
      </div>

      <div className="flex bg-accent/30 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('devices')}
          className={cn("px-6 py-2 rounded-md text-sm font-medium transition-all", activeTab === 'devices' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          <Monitor className="h-4 w-4 inline mr-2" />
          Devices
        </button>
        <button
          onClick={() => setActiveTab('licenses')}
          className={cn("px-6 py-2 rounded-md text-sm font-medium transition-all", activeTab === 'licenses' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          <Key className="h-4 w-4 inline mr-2" />
          Licenses
        </button>
      </div>

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
    </div>
  );
}
