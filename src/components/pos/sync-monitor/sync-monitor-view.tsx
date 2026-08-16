'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowLeftRight, CloudUpload, Database, Pause, Play, RefreshCw, Tag, Wifi, WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useConnectivityStore } from '@/lib/connectivity';
import { useAuthSyncBlocked } from '@/lib/sync/auth-sync-state';
import { triggerSyncNow } from '@/hooks/use-sync-offline-orders';
import { triggerCacheRefreshNow } from '@/lib/sync/background-sync';
import {
  isBackgroundSyncPaused, setBackgroundSyncPaused, getLastCacheRefreshAt,
} from '@/lib/sync/sync-control';
import {
  getSyncQueueBreakdown, getDeadLetterItems, retryDeadLetter,
  type QueueBreakdownRow, type DeadLetterItem,
} from '@/lib/db/pos-db';
import { listKVRows, getSyncLog } from '@/lib/db/kv-cache';
import type { KVCacheRow, SyncLogEntry } from '@/lib/db/pos-db';
import { useEffectiveOutletID } from '@/hooks/usePOS';
import { isPlatformOwner as checkPlatformOwner } from '@/lib/auth/permissions';
import { SyncLogTable } from './sync-log-table';
import { PriceReconcileTab } from './price-reconcile-tab';
import { TxnReversalTab } from './txn-reversal-tab';

const POLL_MS = 2_000;
type SyncMonitorTab = 'overview' | 'prices' | 'reversals';

function timeAgo(iso?: string | number | null): string {
  if (!iso) return '—';
  const t = typeof iso === 'number' ? iso : new Date(iso).getTime();
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Friendly labels for kvCache dataset keys (key = `${dataset}:${tenant}[:outlet]`). */
const DATASET_LABELS: Record<string, string> = {
  'pos-settings': 'POS settings',
  'pos-tenders': 'Tender types',
  'pos-categories': 'Categories',
  'loyalty-programs': 'Loyalty programs',
  'recent-orders': 'Recent sales',
  'pin-outlet-info': 'Outlet info (PIN page)',
  'pin-outlets': 'Outlet list (PIN page)',
  'tenant-brand': 'Tenant branding',
  'pos-sections': 'Sections',
  'pos-tables': 'Tables',
};

export function SyncMonitorView() {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  // Txn Reversals is a platform-owner data-repair tool (initiated on tenant request) —
  // the tab is hidden for everyone else, and the API is platform-owner-gated server-side.
  // Uses the CANONICAL isPlatformOwner() helper (claim OR superuser role OR codevertex slug)
  // — the old strict `user.isPlatformOwner === true` check missed login paths that only set
  // roles/slug, hiding the tab on some outlets/use cases.
  const user = useAuthStore((s) => s.user);
  const isPlatformOwner = checkPlatformOwner(user);
  const outletID = useEffectiveOutletID();
  const conn = useConnectivityStore();
  const authSyncBlocked = useAuthSyncBlocked();

  const [queues, setQueues] = useState<QueueBreakdownRow[]>([]);
  const [deadLetters, setDeadLetters] = useState<DeadLetterItem[]>([]);
  const [datasets, setDatasets] = useState<KVCacheRow[]>([]);
  const [log, setLog] = useState<SyncLogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [tab, setTab] = useState<SyncMonitorTab>('overview');

  const load = useCallback(async () => {
    const [q, d, ds, l] = await Promise.all([
      getSyncQueueBreakdown(),
      getDeadLetterItems(),
      tenantID ? listKVRows(tenantID) : Promise.resolve([]),
      getSyncLog(120),
    ]);
    setQueues(q);
    setDeadLetters(d);
    setDatasets(ds);
    setLog(l);
    setPaused(isBackgroundSyncPaused());
    setLastRefresh(getLastCacheRefreshAt());
  }, [tenantID]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    const onControl = () => void load();
    window.addEventListener('pos:bg-sync-control', onControl);
    return () => { clearInterval(t); window.removeEventListener('pos:bg-sync-control', onControl); };
  }, [load]);

  const pendingTotal = queues.reduce((s, q) => s + q.pending, 0);
  const deadTotal = queues.reduce((s, q) => s + q.deadLetter, 0);

  const handleRetry = async (it: DeadLetterItem) => {
    await retryDeadLetter(it.kind, it.id as number);
    triggerSyncNow();
    await load();
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Sync Monitor
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Background sync between this terminal&apos;s offline database and the server.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { triggerSyncNow(); }}
            className="flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm font-semibold hover:bg-accent"
          >
            <CloudUpload className="h-4 w-4" /> Sync now
          </button>
          <button
            onClick={() => { triggerCacheRefreshNow(); }}
            className="flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm font-semibold hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4" /> Refresh caches
          </button>
          <button
            onClick={() => { setBackgroundSyncPaused(!paused); setPaused(!paused); }}
            className={cn(
              'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold',
              paused
                ? 'bg-primary text-primary-foreground'
                : 'border border-border hover:bg-accent text-muted-foreground',
            )}
          >
            {paused ? (<><Play className="h-4 w-4" /> Resume sync</>) : (<><Pause className="h-4 w-4" /> Pause sync</>)}
          </button>
        </div>
      </div>

      {paused && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <Pause className="h-4 w-4" /> Background sync is paused — queued transactions and cache refreshes are on hold.
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab('overview')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors',
            tab === 'overview'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Activity className="h-4 w-4" /> Overview
        </button>
        <button
          onClick={() => setTab('prices')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors',
            tab === 'prices'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Tag className="h-4 w-4" /> Catalog prices
        </button>
        {isPlatformOwner && (
          <button
            onClick={() => setTab('reversals')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors',
              tab === 'reversals'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <ArrowLeftRight className="h-4 w-4" /> Txn Reversals
          </button>
        )}
      </div>

      {tab === 'prices' && <PriceReconcileTab tenantID={tenantID} outletID={outletID} />}
      {tab === 'reversals' && isPlatformOwner && <TxnReversalTab tenantID={tenantID} />}

      {tab === 'overview' && (
      <>
      {/* ── Status cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {conn.effectiveOnline ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-destructive" />}
            Connection
          </div>
          <p className={cn('mt-1 text-lg font-bold', conn.effectiveOnline ? 'text-emerald-600' : 'text-destructive')}>
            {conn.effectiveOnline ? 'Online' : conn.browserOnline ? 'Unreachable (weak network)' : 'Offline'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last server contact {timeAgo(conn.lastSuccessAt)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CloudUpload className="h-4 w-4" /> Waiting to sync
          </div>
          <p className="mt-1 text-lg font-bold">{pendingTotal}</p>
          <p className="text-xs text-muted-foreground mt-0.5">transactions queued on this device</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className={cn('h-4 w-4', deadTotal > 0 && 'text-destructive')} /> Needs attention
          </div>
          <p className={cn('mt-1 text-lg font-bold', deadTotal > 0 && 'text-destructive')}>{deadTotal}</p>
          <p className="text-xs text-muted-foreground mt-0.5">failed items awaiting manual retry</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Database className="h-4 w-4" /> Cache refresh
          </div>
          <p className="mt-1 text-lg font-bold">{timeAgo(lastRefresh)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">all datasets refresh every 5 min</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Outbound queues ── */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <h2 className="px-4 py-3 border-b border-border text-sm font-bold">Outbound queues (device → server)</h2>
          {authSyncBlocked && (
            <div className="mx-4 mt-3 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <span className="font-semibold">Waiting for re-login.</span> Pending items above are saved safely and will sync automatically once someone logs back in — this is not a failure.
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Queue</th>
                <th className="px-4 py-2 text-right">Pending</th>
                <th className="px-4 py-2 text-right">Failed</th>
                <th className="px-4 py-2 text-right">Synced</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((q) => (
                <tr key={q.queue} className="border-t border-border/60">
                  <td className="px-4 py-2 font-medium">{q.queue}</td>
                  <td className={cn('px-4 py-2 text-right tabular-nums', q.pending > 0 && 'font-bold text-amber-600')}>{q.pending}</td>
                  <td className={cn('px-4 py-2 text-right tabular-nums', q.deadLetter > 0 && 'font-bold text-destructive')}>{q.deadLetter}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{q.synced}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {deadLetters.length > 0 && (
            <div className="border-t border-border p-4 space-y-2">
              <p className="text-sm font-semibold text-destructive">Failed items</p>
              <div className="max-h-56 overflow-y-auto space-y-2">
                {deadLetters.map((it) => (
                  <div key={`${it.kind}-${it.id}`} className="rounded-xl border border-border p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold capitalize">{it.kind.replace('_', ' ')}</span>
                      <button
                        onClick={() => void handleRetry(it)}
                        className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        <RefreshCw className="h-3 w-3" /> Retry
                      </button>
                    </div>
                    <p className="mt-0.5 text-sm">{it.summary}</p>
                    {it.error && <p className="mt-0.5 text-xs text-destructive line-clamp-2">{it.error}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Cached datasets (server → device) ── */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <h2 className="px-4 py-3 border-b border-border text-sm font-bold">Cached datasets (server → device)</h2>
          {datasets.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nothing cached yet — datasets appear after the first refresh.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">Dataset</th>
                  <th className="px-4 py-2 text-right">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {[...datasets]
                  .sort((a, b) => (a.key < b.key ? -1 : 1))
                  .map((row) => {
                    const name = row.key.split(':')[0];
                    return (
                      <tr key={row.key} className="border-t border-border/60">
                        <td className="px-4 py-2 font-medium">{DATASET_LABELS[name] ?? name}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">{timeAgo(row.cached_at)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* ── Activity log ── */}
      <SyncLogTable entries={log} />
      </>
      )}
    </div>
  );
}
