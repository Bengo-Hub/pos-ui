'use client';

import { useQuery } from '@tanstack/react-query';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/api/client';
import { Badge, Button, Card, CardContent } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { useDeviceConfig } from '@/hooks/useDeviceConfig';

interface POSDevice {
  id: string;
  device_code: string;
  device_type: string;
  status: string;
  outlet_name?: string;
  last_seen_at?: string | null;
  registered_at: string;
}

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

const deviceIcons: Record<string, typeof Monitor> = {
  terminal: Monitor, web_terminal: Monitor, tablet: Tablet, mobile: Smartphone,
};

const statusVariant = (s: string) =>
  s === 'active' ? 'success' : s === 'pending' ? 'warning' : 'outline';

/**
 * DevicesTab is a READ-ONLY list of the POS devices linked to the outlet.
 *
 * Devices are auto-provisioned when a staff member first opens a shift on a terminal, so
 * there is no create/delete UI here — registration and decommissioning are platform-admin
 * concerns. This component is shared by the platform-admin page and the tenant settings page
 * (where a tenant admin/manager can see their linked devices but cannot edit them).
 */
export function DevicesTab() {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  const { config, update, loaded } = useDeviceConfig();

  const { data, isLoading, refetch, isFetching } = useQuery<{ data: POSDevice[]; total: number }>({
    queryKey: ['pos-devices', tenantID],
    queryFn: () => apiClient.get(`/api/v1/${tenantID}/pos/devices`),
    enabled: !!tenantID,
    staleTime: 30_000,
  });

  const devices = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? '…' : `${devices.length} device${devices.length !== 1 ? 's' : ''} linked`}
        </p>
        <Button size="sm" variant="outline" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <Card key={i}><CardContent className="p-5"><div className="h-14 animate-pulse rounded-lg bg-accent/20" /></CardContent></Card>
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground border-2 border-dashed border-border rounded-2xl">
          <Monitor className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No devices linked yet.</p>
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

      {/* This-till peripherals (cash drawer / printer / scanner) — saved on this device. */}
      {loaded && (
        <div className="pt-2">
          <h3 className="text-sm font-semibold mb-3">Peripherals (this till)</h3>
          <Card>
            <CardContent className="p-5 divide-y divide-border">
              <PeriphToggle label="Cash drawer connected" desc="ESC/POS kick via the receipt printer" checked={config.cashDrawerEnabled} onChange={(v) => update({ cashDrawerEnabled: v })} />
              <PeriphToggle label="Open drawer on cash sale" checked={config.openDrawerOnCash} onChange={(v) => update({ openDrawerOnCash: v })} />
              <PeriphToggle label="Blind cash-up at shift end" desc="Count without seeing the expected total — the single most effective shrinkage control" checked={config.blindClose} onChange={(v) => update({ blindClose: v })} />
              <div className="flex items-center justify-between py-3">
                <p className="text-sm font-medium">Receipt width</p>
                <div className="flex gap-1.5">
                  {(['58', '80'] as const).map((w) => (
                    <button key={w} type="button" onClick={() => update({ receiptWidth: w })}
                      className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors', config.receiptWidth === w ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-accent')}>
                      {w}mm
                    </button>
                  ))}
                </div>
              </div>
              <PeriphToggle label="Auto-print receipt on sale" checked={config.autoPrintReceipt} onChange={(v) => update({ autoPrintReceipt: v })} />
              <PeriphToggle label="Keyboard-wedge scanner" desc="USB/Bluetooth wedge scanners type the barcode + Enter" checked={config.scannerEnabled} onChange={(v) => update({ scannerEnabled: v })} />
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground mt-2">
            Payment gateways (DPO Pay) are configured under Accounting → Payment gateways (treasury). DPO Network POS / card PDQ need a manual application.
          </p>
        </div>
      )}
    </div>
  );
}

function PeriphToggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="w-full flex items-center justify-between gap-4 py-3 text-left">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <span className={cn('relative h-6 w-11 rounded-full transition-colors shrink-0', checked ? 'bg-primary' : 'bg-muted')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </span>
    </button>
  );
}
