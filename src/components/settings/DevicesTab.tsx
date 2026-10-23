'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Monitor } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/api/client';
import { Badge, Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { KindIcon } from '@/components/ui/kind-icon';
import { cn } from '@/lib/utils';
import { browserLabel, deviceLabel, kindLabel, shortClientId, type DeviceClient } from '@/lib/client-trail';
import { DEVICE_NAME_MAX, getDeviceName, setDeviceName } from '@/lib/device-identity';
import { useDeviceIdentity } from '@/hooks/use-device-identity';

interface POSDevice {
  id: string;
  device_code: string;
  device_type: string;
  status: string;
  outlet_name?: string;
  last_seen_at?: string | null;
  registered_at: string;
  clients?: DeviceClient[];
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

const statusVariant = (s: string) =>
  s === 'active' ? 'success' : s === 'pending' ? 'warning' : 'outline';

const inputClass = 'bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none w-full';

/** Names the browser this page is open in; the name goes out with every request (device-identity). */
function ThisDeviceCard() {
  const { clientId, name: saved, kind } = useDeviceIdentity();
  // null = untouched, so the field shows the saved name until the user types.
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? saved;

  const save = () => {
    setDeviceName(name);
    setDraft(null);
    const clean = getDeviceName() ?? '';
    toast.success(clean ? `This device is now "${clean}"` : 'Device name cleared');
  };

  return (
    <Card>
      <CardHeader>
        <span className="font-bold text-sm flex items-center gap-2">
          <KindIcon kind={kind === 'phone' ? 'mobile' : kind === 'tablet' ? 'tablet' : 'desktop'} className="h-4 w-4 text-primary" /> This device
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Give this {kind} a name so the audit trail, sales and shift reports show where each action came from.
          It is stored on this browser only and sent with every request.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className={inputClass}
            value={name}
            maxLength={DEVICE_NAME_MAX}
            placeholder={kind === 'phone' ? "e.g. Titus's iPhone" : kind === 'tablet' ? 'e.g. Bar tablet' : 'e.g. Front counter PC'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          />
          <Button size="sm" className="gap-2 shrink-0" onClick={save} disabled={name.trim() === saved}>
            <Check className="h-4 w-4" /> Save name
          </Button>
        </div>
        {clientId && <p className="text-[11px] text-muted-foreground font-mono">Browser ID {shortClientId(clientId)}</p>}
      </CardContent>
    </Card>
  );
}

function ClientRow({ c, isThis }: { c: DeviceClient; isThis: boolean }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <KindIcon kind={c.device_kind} className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{deviceLabel(c) || 'Unknown device'}</span>
          {isThis && <Badge variant="success">This device</Badge>}
        </div>
        <p className="text-xs text-muted-foreground truncate" title={c.user_agent}>
          {[c.device_name ? `${kindLabel(c.device_kind)} · ${browserLabel(c)}` : null, c.ip ? `IP ${c.ip}` : null]
            .filter(Boolean).join(' · ')}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Last sign-in {relativeTime(c.last_seen_at)}{c.last_user_name ? ` by ${c.last_user_name}` : ''}
          {c.first_seen_at ? ` · first seen ${new Date(c.first_seen_at).toLocaleDateString()}` : ''}
        </p>
      </div>
    </li>
  );
}

/**
 * DevicesTab lists the POS devices linked to the outlet and, under each, the browsers (phones,
 * tablets, PCs) that have signed in on it.
 *
 * Every browser at an outlet shares the outlet's one auto-provisioned "web terminal" device (it
 * is created when a staff member first opens a shift), so there is no create/delete UI here.
 * This component is shared by the platform-admin page and the tenant settings page.
 */
export function DevicesTab() {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  const { clientId: thisClient } = useDeviceIdentity();

  const { data, isLoading, refetch, isFetching } = useQuery<{ data: POSDevice[]; total: number }>({
    queryKey: ['pos-devices', tenantID],
    queryFn: () => apiClient.get(`/api/v1/${tenantID}/pos/devices`),
    enabled: !!tenantID,
    staleTime: 30_000,
  });

  const devices = data?.data ?? [];

  return (
    <div className="space-y-6">
      <ThisDeviceCard />

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {devices.map((device) => {
            const clients = device.clients ?? [];
            return (
              <Card key={device.id} className="hover:border-primary/30 transition-all">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      'h-12 w-12 rounded-xl flex items-center justify-center border border-border shrink-0',
                      device.status === 'active'  ? 'bg-green-500/10 text-green-500' :
                      device.status === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                                                    'bg-accent/30 text-muted-foreground'
                    )}>
                      <KindIcon kind={device.device_type} className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-sm font-mono truncate">{device.device_code}</h4>
                        <Badge variant={statusVariant(device.status)}>{device.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground capitalize mt-1">{device.device_type.replace('_', ' ')}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                        {device.outlet_name && <span>{device.outlet_name}</span>}
                        <span>Last seen: {relativeTime(device.last_seen_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-border pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Browsers signed in here ({clients.length})
                    </p>
                    {clients.length === 0 ? (
                      <p className="text-xs text-muted-foreground mt-2">None recorded yet. Browsers appear here after their next PIN sign-in.</p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {clients.map((c) => <ClientRow key={c.key} c={c} isThis={!!thisClient && c.client_id === thisClient} />)}
                      </ul>
                    )}
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
