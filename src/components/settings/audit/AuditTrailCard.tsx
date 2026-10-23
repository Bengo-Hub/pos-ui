'use client';

import { ChevronDown, ChevronRight, Loader2, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Fragment, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/base';
import { KindIcon } from '@/components/ui/kind-icon';
import type { AuditLogEntry } from '@/lib/api/audit';
import { browserLabel, deviceLabel, shortClientId } from '@/lib/client-trail';
import { actionMeta, actorLabel } from './actions';

function JsonBlock({ title, value }: { title: string; value?: Record<string, unknown> }) {
  if (!value || Object.keys(value).length === 0) return null;
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{title}</p>
      <pre className="text-[11px] bg-accent/10 rounded-lg p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

interface Props {
  rows: AuditLogEntry[];
  total: number;
  loading: boolean;
  onPickClient: (clientId: string | undefined, ip: string | undefined) => void;
}

/** The full audit trail: who, what, which order, from which device and IP, with details on expand. */
export function AuditTrailCard({ rows, total, loading, onPickClient }: Props) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <span className="font-bold text-sm flex items-center gap-2"><ScrollText className="h-4 w-4 text-primary" /> Audit trail</span>
        <span className="text-xs text-muted-foreground">{total} entries</span>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No audit entries match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-accent/5 text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="w-8" />
                  <th className="text-left px-3 py-3">When</th>
                  <th className="text-left px-3 py-3">User</th>
                  <th className="text-left px-3 py-3">Action</th>
                  <th className="text-left px-3 py-3">Order / item</th>
                  <th className="text-left px-3 py-3">Device</th>
                  <th className="text-left px-3 py-3">IP</th>
                  <th className="text-left px-3 py-3">Approved by</th>
                  <th className="text-right px-3 py-3">Amount</th>
                  <th className="text-left px-3 py-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((e) => {
                  const meta = actionMeta(e.action);
                  const c = e.client;
                  const isOpen = open === e.id;
                  return (
                    <Fragment key={e.id}>
                      <tr className="hover:bg-accent/5 cursor-pointer" onClick={() => setOpen(isOpen ? null : e.id)}>
                        <td className="pl-3 text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs font-medium">{actorLabel(e.actor_user_id, e.actor_name)}</td>
                        <td className="px-3 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${meta.cls}`}>{meta.label}</span></td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap">
                          {e.order_id ? (
                            <Link href={`/${orgSlug}/orders/${e.order_id}`} className="text-primary hover:underline" onClick={(ev) => ev.stopPropagation()}>
                              {e.entity_label}
                            </Link>
                          ) : (e.entity_label || <span className="text-muted-foreground">—</span>)}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {c ? (
                            <button className="flex items-center gap-1.5 hover:underline text-left" title={browserLabel(c) || undefined}
                              onClick={(ev) => { ev.stopPropagation(); onPickClient(c.client_id, c.client_id ? undefined : c.ip); }}>
                              <KindIcon kind={c.device_kind} className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate max-w-48">{deviceLabel(c) || 'Unknown device'}</span>
                            </button>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3 text-xs font-mono whitespace-nowrap">
                          {c?.ip ? (
                            <button className="hover:underline" onClick={(ev) => { ev.stopPropagation(); onPickClient(undefined, c.ip); }}>{c.ip}</button>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap">
                          {e.approver_user_id
                            ? <span className="inline-flex items-center gap-1 text-green-600"><span>✓</span><span className="text-foreground font-medium">{actorLabel(e.approver_user_id, e.approver_name)}</span></span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{e.amount != null ? e.amount.toLocaleString() : '—'}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground max-w-xs truncate" title={e.reason}>{e.reason || '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-accent/5">
                          <td />
                          <td colSpan={9} className="px-3 py-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="text-xs space-y-1 min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Device</p>
                                {c ? (
                                  <>
                                    <p>{deviceLabel(c) || 'Unknown device'}</p>
                                    {browserLabel(c) && <p className="text-muted-foreground">{browserLabel(c)}</p>}
                                    {c.client_id && <p className="text-muted-foreground font-mono">Browser ID {shortClientId(c.client_id)}</p>}
                                    {c.ip && <p className="text-muted-foreground font-mono">IP {c.ip}</p>}
                                  </>
                                ) : <p className="text-muted-foreground">Not recorded (entry predates device tracking).</p>}
                                {e.reason && <p className="pt-1"><span className="text-muted-foreground">Reason:</span> {e.reason}</p>}
                              </div>
                              <JsonBlock title="Before" value={e.before_json} />
                              <JsonBlock title="After" value={e.after_json} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
