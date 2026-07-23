'use client';

import { useEffect, useState, useCallback } from 'react';
import { CloudUpload, AlertTriangle, RefreshCw, X, Check } from 'lucide-react';
import { useEffectiveOnline } from '@/lib/connectivity';
import { usePendingSyncCount, triggerSyncNow } from '@/hooks/use-sync-offline-orders';
import { getDeadLetterItems, retryDeadLetter, type DeadLetterItem } from '@/lib/db/pos-db';
import { cn } from '@/lib/utils';

/**
 * Floating sync-status pill (bottom-right). Shows how many offline sales/payments/voids/
 * returns are still queued, and surfaces dead-lettered items (terminal failures) for manual
 * review + retry. Hidden when everything is synced. Complements the top OfflineBar ribbon.
 */
export function SyncStatusIndicator() {
  const online = useEffectiveOnline();
  const { pending, deadLetter } = usePendingSyncCount();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DeadLetterItem[]>([]);

  const loadItems = useCallback(async () => {
    setItems(await getDeadLetterItems());
  }, []);

  useEffect(() => {
    if (open) void loadItems();
  }, [open, deadLetter, loadItems]);

  // The top OfflineBar ribbon now owns the offline + "Syncing offline data…" (pending) display.
  // This floating pill is reserved for dead-lettered items that need manual review/retry.
  if (deadLetter === 0) return null;

  const handleRetry = async (it: DeadLetterItem) => {
    await retryDeadLetter(it.kind, it.id as number);
    triggerSyncNow();
    await loadItems();
  };

  const handleRetryAll = async () => {
    for (const it of items) await retryDeadLetter(it.kind, it.id as number);
    triggerSyncNow();
    await loadItems();
  };

  return (
    <>
      <button
        data-testid="pos-sync-pill"
        data-pending={pending}
        data-dead-letter={deadLetter}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          // Below lg, MobileBottomNav is a fixed h-16 bar (+ safe-area padding) along the same
          // edge — bottom-4 sat squarely inside it, overlapping/blocking the nav's rightmost tab.
          'fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] lg:bottom-4 right-4 z-[90] flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg transition',
          deadLetter > 0
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-primary text-primary-foreground',
        )}
        aria-label="Sync status"
      >
        {deadLetter > 0 ? (
          <>
            <AlertTriangle className="h-4 w-4" />
            {deadLetter} need attention
          </>
        ) : (
          <>
            <CloudUpload className={cn('h-4 w-4', online && 'animate-pulse')} />
            {pending} {online ? 'syncing' : 'queued'}
          </>
        )}
      </button>

      {open && (
        <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+4rem)] lg:bottom-16 right-4 z-[90] w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-bold">Sync status</span>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-accent">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Queued (will sync{online ? '' : ' on reconnect'})</span>
              <span className="font-semibold">{pending}</span>
            </div>
            {online && pending > 0 && (
              <button
                onClick={() => triggerSyncNow()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2 text-sm font-semibold hover:bg-accent"
              >
                <RefreshCw className="h-4 w-4" /> Sync now
              </button>
            )}

            {deadLetter > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-destructive">Failed ({deadLetter})</span>
                  <button onClick={handleRetryAll} className="text-xs font-semibold text-primary hover:underline">
                    Retry all
                  </button>
                </div>
                <div className="max-h-60 space-y-2 overflow-y-auto">
                  {items.map((it) => (
                    <div key={`${it.kind}-${it.id}`} className="rounded-xl border border-border p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold capitalize">{it.kind.replace('_', ' ')}</span>
                        <button
                          onClick={() => handleRetry(it)}
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

            {pending === 0 && deadLetter === 0 && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <Check className="h-4 w-4" /> All synced
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
