'use client';

import { Header } from '@/components/header';
import { Sidebar } from '@/components/sidebar';
import { AuthProvider } from '@/providers/auth-provider';
import { TenantBrandingProvider } from '@/providers/tenant-branding-provider';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { useOnline } from '@/hooks/use-online';
import { getCachedCatalog, getSyncStatusCounts } from '@/lib/db/pos-db';
import { OfflineBar } from '@bengo-hub/shared-ui-lib/offline';
import { loadFullCatalog, offlineToCatalogItem, FULL_CATALOG_QUERY_KEY } from '@/hooks/usePOS';
import { Footer } from '@/components/footer';
import { SubscriptionBanner } from '@/components/subscription/subscription-banner';
import { SyncStatusIndicator } from '@/components/pos/sync-status-indicator';
import { PWARegistration } from '@/components/pwa-registration';
import { StartShiftGate } from '@/components/pos/start-shift-gate';
import { useSyncOfflineOrders, triggerSyncNow } from '@/hooks/use-sync-offline-orders';
import { useEffect } from 'react';
import { registerBackgroundSync } from '@/lib/sw/register-sync';
import { usePathname, useParams } from 'next/navigation';
import { useNotificationStream } from '@/hooks/use-notification-stream';
import { useAuthStore } from '@/store/auth';

/**
 * Client-side belt-and-suspenders for the tenant manifest link. The authoritative
 * link is emitted server-side via `generateMetadata` in this segment's layout.tsx
 * (so mobile install captures the correct tenant), but this keeps the link correct
 * across in-app (SPA) navigation between tenant scopes.
 */
function ManifestInjector() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string | undefined;
  useEffect(() => {
    if (!orgSlug) return;
    const href = `/${orgSlug}/manifest.webmanifest`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    if (link.href !== new URL(href, window.location.href).href) {
      link.href = href;
    }
  }, [orgSlug]);
  return null;
}

function OfflineSyncWorker() {
  useSyncOfflineOrders();
  useEffect(() => { registerBackgroundSync(); }, []);
  return null;
}

/**
 * Warms the full-catalog cache at the app shell, before the cashier opens the
 * terminal, so the product grid paints instantly (cache-first):
 *  1. Seed the TanStack query from the IndexedDB cache (resolves before network).
 *  2. Revalidate the complete catalog from the API in the background, writing every
 *     item through to IndexedDB so the local cache keeps improving over time.
 */
function CatalogPrewarm() {
  const queryClient = useQueryClient();
  const tenantID = useAuthStore((s) => (s.user as any)?.tenant_id ?? '');
  const isOnline = useOnline();
  useEffect(() => {
    if (!tenantID) return;
    let cancelled = false;
    (async () => {
      try {
        const cached = await getCachedCatalog(tenantID);
        if (!cancelled && cached.length) {
          queryClient.setQueryData(
            [FULL_CATALOG_QUERY_KEY, tenantID],
            cached.map(offlineToCatalogItem),
          );
        }
      } catch { /* cache seed is best-effort */ }
      if (!cancelled && isOnline) {
        queryClient
          .fetchQuery({
            queryKey: [FULL_CATALOG_QUERY_KEY, tenantID],
            queryFn: () => loadFullCatalog(tenantID, true),
            staleTime: 0,
          })
          .catch(() => { /* offline / transient — terminal falls back to cache */ });
      }
    })();
    return () => { cancelled = true; };
  }, [tenantID, isOnline, queryClient]);
  return null;
}

function NotificationListener() {
  const user = useAuthStore((s) => s.user);
  const tenantID = (user as any)?.tenant_id ?? '';
  const userID = (user as any)?.staff_id ?? (user as any)?.id ?? '';
  useNotificationStream({ tenantID, userID });
  return null;
}

/** Paths that bypass the full app shell (no header/sidebar/footer). */
const KIOSK_PATHS = ['/pin-login'];

function isKioskRoute(pathname: string | null): boolean {
  return KIOSK_PATHS.some(p => pathname?.endsWith(p) || pathname?.includes(`${p}/`));
}

export function OrgShell({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const kiosk = isKioskRoute(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TenantBrandingProvider>
          <ManifestInjector />
          {/* Shared top ribbon: offline-mode (cash/manual only) + animated "Syncing offline
              data… (N)" driven by the real IndexedDB queue. SW is registered by registerBackgroundSync. */}
          <OfflineBar
            registerSW={false}
            getPendingCount={async () => (await getSyncStatusCounts()).pending}
            onSyncNow={triggerSyncNow}
            availableOffline={['Sell', 'Cash & manual payments', 'Open/close drawer']}
            disabledOffline={['Card / M-Pesa STK', 'Live reports']}
          />
          {/* Floating pill kept for dead-letter review (failed items + manual retry). */}
          <SyncStatusIndicator />
          <OfflineSyncWorker />
          <CatalogPrewarm />
          <NotificationListener />
          <PWARegistration />

          {kiosk ? (
            // Fullscreen kiosk layout — no nav chrome
            <div className="h-screen w-screen overflow-hidden bg-background">
              {children}
            </div>
          ) : (
            // Standard app shell
            <div className="flex h-screen overflow-hidden bg-background">
              <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <Header onMenuClick={() => setSidebarOpen(true)} />
                <SubscriptionBanner />
                <main className="flex-1 overflow-y-auto bg-accent/5">
                  <StartShiftGate>
                    <div className="min-h-full flex flex-col">
                      <div className="flex-1">{children}</div>
                      <Footer />
                    </div>
                  </StartShiftGate>
                </main>
              </div>
            </div>
          )}
        </TenantBrandingProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
