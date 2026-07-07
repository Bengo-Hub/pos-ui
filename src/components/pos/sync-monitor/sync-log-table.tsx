'use client';

import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncLogEntry } from '@/lib/db/pos-db';
import { clearSyncLog } from '@/lib/db/kv-cache';

const ENTITY_LABELS: Record<string, string> = {
  order: 'Sale',
  payment: 'Payment',
  void: 'Void',
  return: 'Return',
  drawer_open: 'Drawer open',
  drawer_close: 'Drawer close',
  etims: 'eTIMS',
  catalog: 'Catalog',
  'pos-settings': 'POS settings',
  'pos-tenders': 'Tender types',
  'pos-categories': 'Categories',
  'loyalty-programs': 'Loyalty programs',
  'recent-orders': 'Recent sales',
};

type Filter = 'all' | 'push' | 'pull' | 'errors';

/** Live pull/push activity feed for the sync-monitor page (bounded syncLog Dexie table). */
export function SyncLogTable({ entries }: { entries: SyncLogEntry[] }) {
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = entries.filter((e) => {
    if (filter === 'push') return e.direction === 'push';
    if (filter === 'pull') return e.direction === 'pull';
    if (filter === 'errors') return e.status === 'error';
    return true;
  });

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold">Sync activity</h2>
        <div className="flex items-center gap-1.5">
          {(['all', 'push', 'pull', 'errors'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold capitalize',
                filter === f ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent',
              )}
            >
              {f === 'push' ? 'To server' : f === 'pull' ? 'From server' : f}
            </button>
          ))}
          <button
            onClick={() => void clearSyncLog()}
            className="ml-2 flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-accent"
            title="Clear the activity log"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No sync activity yet.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">Direction</th>
                <th className="px-4 py-2">What</th>
                <th className="px-4 py-2">Detail</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-t border-border/60 align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                    {new Date(e.ts).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                      {e.direction === 'push'
                        ? (<><ArrowUpFromLine className="h-3.5 w-3.5 text-blue-500" /> To server</>)
                        : (<><ArrowDownToLine className="h-3.5 w-3.5 text-emerald-500" /> From server</>)}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-medium">{ENTITY_LABELS[e.entity] ?? e.entity}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {e.detail || '—'}
                    {e.error && <p className="text-xs text-destructive mt-0.5 break-words">{e.error}</p>}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
                        e.status === 'ok' && 'bg-emerald-500/15 text-emerald-600',
                        e.status === 'error' && 'bg-destructive/15 text-destructive',
                        e.status === 'skipped' && 'bg-muted text-muted-foreground',
                      )}
                    >
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
