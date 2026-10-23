'use client';

import { WifiOff } from 'lucide-react';
import { KindIcon } from '@/components/ui/kind-icon';
import { asTrail, browserLabel, deviceLabel, shortClientId, type ClientTrail, type OfflineOrigin } from '@/lib/client-trail';

function TrailLine({ title, trail }: { title: string; trail: ClientTrail }) {
  return (
    <div className="flex items-start gap-2.5">
      <KindIcon kind={trail.device_kind} className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 text-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        <p className="font-medium truncate">{deviceLabel(trail) || 'Unknown device'}</p>
        {(trail.device_name ? browserLabel(trail) : '') && <p className="text-xs text-muted-foreground">{browserLabel(trail)}</p>}
        <p className="text-xs text-muted-foreground font-mono">
          {[trail.ip ? `IP ${trail.ip}` : null, trail.client_id ? `ID ${shortClientId(trail.client_id)}` : null].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}

/**
 * Where the sale came from: the device, browser and IP that created it (metadata.client), and for
 * an offline sale who rang it up on which device versus who synced it (metadata.offline). Renders
 * nothing for orders written before device tracking (2026-10-23).
 */
export function OrderOriginCard({ metadata }: { metadata?: Record<string, unknown> }) {
  const created = asTrail(metadata?.client);
  const offline = (metadata?.offline && typeof metadata.offline === 'object' ? metadata.offline : null) as OfflineOrigin | null;
  if (!created && !offline) return null;
  const rungUpOn = asTrail(offline?.rung_up_on);

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
      <h2 className="font-bold text-base">Origin</h2>
      {offline && (
        <div className="rounded-xl bg-purple-500/10 text-purple-700 dark:text-purple-300 p-3 text-xs space-y-1">
          <p className="flex items-center gap-1.5 font-semibold"><WifiOff className="h-3.5 w-3.5" /> Rung up offline</p>
          {offline.offline_created_at && <p>Rung up {new Date(offline.offline_created_at).toLocaleString()} (device clock)</p>}
          {offline.rung_up_by_name && (
            <p>
              By {offline.rung_up_by_name}
              {offline.rung_up_by_verified === false && ' (not verified, credited to the syncing login)'}
            </p>
          )}
          {offline.synced_at && <p>Synced {new Date(offline.synced_at).toLocaleString()}</p>}
        </div>
      )}
      {rungUpOn && <TrailLine title="Rung up on" trail={rungUpOn} />}
      {created && <TrailLine title={offline ? 'Synced from' : 'Created on'} trail={created} />}
    </div>
  );
}
