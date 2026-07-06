'use client';

import { Header } from '@/components/header';
import { Sidebar } from '@/components/sidebar';
import { AuthProvider } from '@/providers/auth-provider';
import { TenantBrandingProvider } from '@/providers/tenant-branding-provider';
import { SubscriptionEntitlementsProvider } from '@/providers/subscription-entitlements-provider';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { useOnline } from '@/hooks/use-online';
import { getCachedCatalog, getSyncStatusCounts } from '@/lib/db/pos-db';
import { OfflineBar } from '@bengo-hub/shared-ui-lib/offline';
import { revalidateFullCatalog, useCatalogVersionSync, offlineToCatalogItem, FULL_CATALOG_QUERY_KEY } from '@/hooks/usePOS';
import { Footer } from '@/components/footer';
import { SubscriptionBanner } from '@/components/subscription/subscription-banner';
import { SyncStatusIndicator } from '@/components/pos/sync-status-indicator';
import { PWARegistration } from '@/components/pwa-registration';
import { StartShiftGate } from '@/components/pos/start-shift-gate';
import { TerminalIdleScreensaver } from '@/components/pos/terminal-idle-screensaver';
import { useSyncOfflineOrders, triggerSyncNow } from '@/hooks/use-sync-offline-orders';
import { useEffect } from 'react';
import { registerBackgroundSync } from '@/lib/sw/register-sync';
import { usePathname, useParams } from 'next/navigation';
import { useNotificationStream } from '@/hooks/use-notification-stream';
import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/api/client';
import { resolveActiveOutlet } from '@/lib/auth/outlet-resolver';

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
 *     item through to IndexedDB so the local cache keeps improving over time — the
 *     network NEVER blocks the paint, even on a slow connection.
 *  3. Poll the cheap catalog-version fingerprint (useCatalogVersionSync) so items
 *     added in inventory appear on the terminal automatically — no refresh/re-login.
 */
function CatalogPrewarm() {
  const queryClient = useQueryClient();
  const tenantID = useAuthStore((s) => (s.user as any)?.tenant_id ?? '');
  const isOnline = useOnline();
  useCatalogVersionSync();
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
        // Background revalidation — refreshes IndexedDB + the query cache when it lands.
        void revalidateFullCatalog(queryClient, tenantID);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantID, isOnline, queryClient]);
  return null;
}

/**
 * OutletContextHealer — repairs SSO sessions whose outlet context never resolved.
 *
 * Root cause of "sidebar items fail to load after SSO login": logout clears the store's
 * outlet but deliberately KEEPS `pos-selected-outlet-id` in localStorage (pin-login
 * auto-select). The SSO callback then saw the leftover key and skipped the outlet
 * selector WITHOUT hydrating the store — outlet.use_case stayed null, useModuleAccess
 * never resolved, and the sidebar rendered its skeleton forever. PIN login always calls
 * setOutlet with a full outlet, which is why it worked.
 *
 * Whenever an authenticated non-terminal session has no outlet use_case, resolve the
 * active outlet from the API (last-used → single → HQ → first) and hydrate the store.
 * Also self-heals already-stuck sessions without forcing a re-login.
 */
function OutletContextHealer() {
  const status = useAuthStore((s) => s.status);
  const isTerminalSession = useAuthStore((s) => s.isTerminalSession);
  const outletUseCase = useAuthStore((s) => s.outlet?.use_case);
  const outletId = useAuthStore((s) => s.outlet?.id);
  const tenantID = useAuthStore((s) => (s.user as any)?.tenant_id ?? '');
  useEffect(() => {
    if (status !== 'authenticated' || isTerminalSession || outletUseCase || !tenantID) return;
    let cancelled = false;
    (async () => {
      try {
        const resolved = await resolveActiveOutlet(tenantID, outletId);
        if (!cancelled && resolved) {
          useAuthStore.getState().setOutlet(resolved);
        }
      } catch {
        /* best-effort — the sidebar keeps its skeleton until the next attempt */
      }
    })();
    return () => { cancelled = true; };
  }, [status, isTerminalSession, outletUseCase, outletId, tenantID]);
  return null;
}

function NotificationListener() {
  const user = useAuthStore((s) => s.user);
  const tenantID = (user as any)?.tenant_id ?? '';
  const userID = (user as any)?.staff_id ?? (user as any)?.id ?? '';
  useNotificationStream({ tenantID, userID });
  return null;
}

/**
 * Platform separation guard (see plan: platform-owner-self-tenant-separation).
 *
 * The agreed model is "Dedicated Platform section": the main app is the owner's OWN business
 * (scoped to codevertex by default) and any cross-tenant drill-in is confined to `/platform/*`.
 * pos-ui has no `?tenantId=` drill-in today (cross-tenant header suppression lives on the
 * apiClient via setPlatformOwner), so this is a defensive belt-and-suspenders: whenever the
 * route is NOT under `/platform`, ensure cross-tenant suppression is OFF so business pages
 * always carry the owner's own X-Tenant-ID / X-Tenant-Slug and scope to codevertex. If a
 * platform drill-in is ever added, it must set it only while on `/platform` — this effect
 * still clears it on the way out.
 */
function PlatformDrillInConfinement() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname?.includes('/platform')) {
      apiClient.setPlatformOwner(false);
    }
  }, [pathname]);
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
  // Desktop sidebar collapse. The POS terminal (/order) defaults to collapsed so the cart + product
  // grid get the full screen width; the cashier can toggle it back via the header button. Navigating
  // away from the terminal restores the expanded sidebar.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const kiosk = isKioskRoute(pathname);
  const isTerminal = /\/order(\/|$)/.test(pathname ?? '');
  useEffect(() => { setSidebarCollapsed(isTerminal); }, [isTerminal]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TenantBrandingProvider>
          <SubscriptionEntitlementsProvider>
          <ManifestInjector />
          {/* Shared top ribbon: offline-mode (cash/manual only) + animated "Syncing offline
              data… (N)" driven by the real IndexedDB queue. SW is registered by registerBackgroundSync. */}
          <OfflineBar
            registerSW
            getPendingCount={async () => (await getSyncStatusCounts()).pending}
            onSyncNow={triggerSyncNow}
            availableOffline={['Sell', 'Cash & manual payments', 'Open/close drawer']}
            disabledOffline={['Card / M-Pesa STK', 'Live reports']}
          />
          {/* Floating pill kept for dead-letter review (failed items + manual retry). */}
          <SyncStatusIndicator />
          <OfflineSyncWorker />
          <CatalogPrewarm />
          <OutletContextHealer />
          <NotificationListener />
          <PlatformDrillInConfinement />
          <PWARegistration />

          {/* Branded idle lock for active PIN/terminal sessions — wakes to the PIN pad so the
              next staff member must re-authenticate. No-ops for SSO sessions and the kiosk route. */}
          <TerminalIdleScreensaver />

          {kiosk ? (
            // Fullscreen kiosk layout — no nav chrome
            <div className="h-screen w-screen overflow-hidden bg-background">
              {children}
            </div>
          ) : (
            // Standard app shell
            <div className="flex h-screen overflow-hidden bg-background">
              <Sidebar open={sidebarOpen} collapsed={sidebarCollapsed} onClose={() => setSidebarOpen(false)} />
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <Header
                  onMenuClick={() => setSidebarOpen(true)}
                  sidebarCollapsed={sidebarCollapsed}
                  onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
                />
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
          </SubscriptionEntitlementsProvider>
        </TenantBrandingProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
