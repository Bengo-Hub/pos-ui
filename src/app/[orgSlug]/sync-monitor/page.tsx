'use client';

import { PageGuard } from '@/components/auth/page-guard';
import { P } from '@/lib/rbac/permissions';
import { SyncMonitorView } from '@/components/pos/sync-monitor/sync-monitor-view';

/**
 * Sync Monitor — admin/manager surface for the offline-first engine: live connectivity,
 * per-queue pending/dead-letter counts, IndexedDB dataset freshness, and the pull/push
 * activity log, plus Sync-now / Refresh-caches / Pause controls.
 */
export default function SyncMonitorPage() {
  return (
    <PageGuard
      moduleKey="settings"
      permission={[P.CONFIG_VIEW, P.CONFIG_CHANGE, P.CONFIG_MANAGE]}
      label="Sync Monitor"
    >
      <SyncMonitorView />
    </PageGuard>
  );
}
