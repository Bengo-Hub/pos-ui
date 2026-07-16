'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { isPlatformOwner as checkPlatformOwner } from '@/lib/auth/permissions';
import { useAuthStore } from '@/store/auth';
import { SyncMonitorView } from '@/components/pos/sync-monitor/sync-monitor-view';

/**
 * Sync Monitor — platform diagnostics surface for the offline-first engine: live connectivity,
 * per-queue pending/dead-letter counts, IndexedDB dataset freshness, and the pull/push
 * activity log, plus Sync-now / Refresh-caches / Pause controls.
 *
 * Platform-owner only (per the use-case PowerSuite specs): tenant admins never see this —
 * it lives in the sidebar's Platform section, same guard pattern as /platform.
 */
export default function SyncMonitorPage() {
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const isPlatformOwner = checkPlatformOwner(user);

  useEffect(() => {
    if (user && !isPlatformOwner) {
      router.replace(`/${orgSlug}/settings`);
    }
  }, [user, isPlatformOwner, orgSlug, router]);

  if (!user || !isPlatformOwner) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  return <SyncMonitorView />;
}
