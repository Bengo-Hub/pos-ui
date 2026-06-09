'use client';

import { useQuery } from '@tanstack/react-query';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/api/client';
import { Badge, Button, Card, CardContent } from '@/components/ui/base';
import { cn } from '@/lib/utils';

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
    </div>
  );
}
