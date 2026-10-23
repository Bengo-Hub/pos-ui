'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/base';
import { KindIcon } from '@/components/ui/kind-icon';
import type { ExceptionAgg } from '@/lib/api/audit';
import { actionMeta, actorLabel } from './actions';

interface Props {
  rows: ExceptionAgg[];
  loading: boolean;
  /** Start of the period the report covers (the server defaults to 30 days). */
  from?: string;
  onPickActor: (actorId: string) => void;
  onPickClient: (clientId: string | undefined, ip: string | undefined) => void;
}

/** Per staff member: counts of fraud-relevant actions, and the devices and IPs they signed in from. */
export function ExceptionsCard({ rows, loading, from, onPickActor, onPickClient }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> Exception report (per staff member)
        </span>
        {from && <span className="text-xs text-muted-foreground">Since {new Date(from).toLocaleDateString()}</span>}
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No exceptions or sign-ins in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-accent/5 text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Staff</th>
                  <th className="text-center px-4 py-3">Exceptions</th>
                  <th className="text-left px-4 py-3">Breakdown</th>
                  <th className="text-left px-4 py-3">Signed in from</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((e) => (
                  <tr key={e.actor_user_id} className="hover:bg-accent/5 align-top">
                    <td className="px-4 py-3">
                      <button className="font-medium text-left hover:underline" onClick={() => onPickActor(e.actor_user_id)}
                        title="Show this person's audit trail">
                        {actorLabel(e.actor_user_id, e.actor_name)}
                      </button>
                      {e.sign_ins > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {e.sign_ins} sign-in{e.sign_ins !== 1 ? 's' : ''} · {e.device_count} device{e.device_count !== 1 ? 's' : ''} · {e.ip_count} IP{e.ip_count !== 1 ? 's' : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-bold">{e.total || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(e.counts).map(([action, n]) => {
                          const meta = actionMeta(action);
                          const amt = e.amounts?.[action];
                          return (
                            <span key={action} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}
                              title={amt ? `Total ${amt.toLocaleString()}` : undefined}>
                              {meta.label}: {n}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {e.devices.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {e.devices.slice(0, 4).map((d) => {
                            return (
                              <button key={`${d.client_id ?? d.label}-${d.ip ?? ''}`}
                                onClick={() => onPickClient(d.client_id, d.client_id ? undefined : d.ip)}
                                className="flex items-center gap-1.5 text-xs text-left hover:underline"
                                title={`Last sign-in ${new Date(d.last_at).toLocaleString()} · show this device's activity`}>
                                <KindIcon kind={d.device_kind} className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate max-w-56">{d.label}</span>
                                <span className="text-muted-foreground">×{d.sign_ins}{d.ip ? ` · ${d.ip}` : ''}</span>
                              </button>
                            );
                          })}
                          {e.devices.length > 4 && <span className="text-[11px] text-muted-foreground">+{e.devices.length - 4} more</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
