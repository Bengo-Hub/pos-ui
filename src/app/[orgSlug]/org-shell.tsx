'use client';

import { Header } from '@/components/header';
import { Sidebar } from '@/components/sidebar';
import { AuthProvider } from '@/providers/auth-provider';
import { TenantBrandingProvider } from '@/providers/tenant-branding-provider';
import { SubscriptionEntitlementsProvider } from '@/providers/subscription-entitlements-provider';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { useEffectiveOnline } from '@/lib/connectivity';
import { getCachedCatalog, getSyncStatusCounts } from '@/lib/db/pos-db';
import { OfflineBar } from '@bengo-hub/shared-ui-lib/offline';
import { revalidateFullCatalog, useCatalogVersionSync, offlineToCatalogItem, FULL_CATALOG_QUERY_KEY } from '@/hooks/usePOS';
import { Footer } from '@/components/footer';
import { SubscriptionBanner } from '@/components/subscription/subscription-banner';
import { SyncStatusIndicator } from '@/components/pos/sync-status-indicator';
import { PWARegistration } from '@/components/pwa-registration';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { StartShiftGate } from '@/components/pos/start-shift-gate';
import { RouteGuard } from '@/components/auth/route-guard';
import { TerminalIdleScreensaver } from '@/components/pos/terminal-idle-screensaver';
import { triggerSyncNow } from '@/hooks/use-sync-offline-orders';
import { useBackgroundSync } from '@/lib/sync/background-sync';
import { useEffect } from 'react';
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

/** The ONE dedicated background sync job: 10s queue drain + 5-min IndexedDB cache refresh
 *  (settings/tenders/categories/loyalty/recent-orders/staff-profiles/catalog) + SW registration. */
function BackgroundSyncWorker() {
  useBackgroundSync();
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
  // The catalog is OUTLET-scoped (use-case filtered server-side) — cache keys and the
  // IndexedDB read must carry the effective outlet so outlets never see each other's menu.
  const outletID = useAuthStore(
    (s) => s.selectedOutletId ?? s.outlet?.id ?? (s.user as any)?.outlet_id ?? '',
  );
  const isOnline = useEffectiveOnline();
  useCatalogVersionSync();
  useEffect(() => {
    if (!tenantID) return;
    let cancelled = false;
    (async () => {
      try {
        const cached = await getCachedCatalog(tenantID, outletID);
        if (!cancelled && cached.length) {
          queryClient.setQueryData(
            [FULL_CATALOG_QUERY_KEY, tenantID, outletID],
            cached.map(offlineToCatalogItem),
          );
        }
      } catch { /* cache seed is best-effort */ }
      if (!cancelled && isOnline) {
        // Background revalidation — refreshes IndexedDB + the query cache when it lands.
        void revalidateFullCatalog(queryClient, tenantID, outletID);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantID, outletID, isOnline, queryClient]);
  return null;
}

/**
 * OutletContextHealer — repairs sessions whose outlet context never resolved.
 *
 * Root cause of "sidebar items fail to load after SSO login": logout clears the store's
 * outlet but deliberately KEEPS `pos-selected-outlet-id` in localStorage (pin-login
 * auto-select). The SSO callback then saw the leftover key and skipped the outlet
 * selector WITHOUT hydrating the store — outlet.use_case stayed null, useModuleAccess
 * never resolved, and the sidebar rendered its skeleton forever.
 *
 * Terminal (PIN) sessions normally always call setOutlet with a full outlet at login, so
 * they're excluded from the use_case check below — EXCEPT the offline-login fallback can
 * still complete with no `outlet.id` at all in rare edge cases (a pre-fix cached session,
 * or a device that never had outlet info cached). That specific gap — missing outlet id,
 * not missing use_case — is also self-healed here so "tables fail to load" doesn't need a
 * re-login to recover.
 *
 * Whenever an authenticated non-terminal session has no outlet use_case, OR any
 * authenticated session (including terminal) has no outlet id at all, resolve the active
 * outlet from the API (last-used → single → HQ → first) and hydrate the store. Also
 * self-heals already-stuck sessions without forcing a re-login.
 */
function OutletContextHealer() {
  const status = useAuthStore((s) => s.status);
  const isTerminalSession = useAuthStore((s) => s.isTerminalSession);
  const outletUseCase = useAuthStore((s) => s.outlet?.use_case);
  const outletId = useAuthStore((s) => s.outlet?.id);
  const tenantID = useAuthStore((s) => (s.user as any)?.tenant_id ?? '');
  // The outlet this staff member is tied to (StaffOutlet home outlet). On a fresh login the store
  // outlet is null, so we PRESELECT the user's assigned outlet here — falling back to the tenant
  // default/HQ only when the user has no assignment (HQ/admin). A mid-session switch persists a
  // full outlet (with use_case), so this healer no-ops on reload and the switch is respected.
  const homeOutletId = useAuthStore((s) => (s.user as any)?.home_outlet_id ?? '');
  useEffect(() => {
    if (status !== 'authenticated' || !tenantID) return;
    const needsHeal = isTerminalSession ? !outletId : !outletUseCase;
    if (!needsHeal) return;
    let cancelled = false;
    (async () => {
      try {
        // Prefer the user's assigned/home outlet; fall back to the current store id when unassigned.
        const resolved = await resolveActiveOutlet(tenantID, homeOutletId || outletId);
        if (!cancelled && resolved) {
          useAuthStore.getState().setOutlet(resolved);
        }
      } catch {
        /* best-effort — the sidebar keeps its skeleton until the next attempt */
      }
    })();
    return () => { cancelled = true; };
  }, [status, isTerminalSession, outletUseCase, outletId, tenantID, homeOutletId]);
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
 * ServicePermissionsRefresher — re-pulls pos-api's own /auth/me so a permission change a manager
 * makes mid-shift (edits a role's matrix, assigns/removes an extra role) reaches an already-open
 * session's sidebar/RouteGuard/action gating without forcing a full logout. Covers BOTH SSO and
 * PIN/terminal sessions (pos-api's /auth/me accepts either token via RequireAnyAuth) — terminal
 * sessions especially needed this, since their JWT previously never refreshed for its whole 4h
 * life. Fires ONCE immediately on mount (a page reload previously relied on the persisted-user
 * fast-path hydrate and could go a full interval — or longer, if the tab kept reloading and
 * resetting the timer — before ever re-checking the server) and then every 60s: frequent enough
 * that a security-sensitive permission edit (e.g. revoking Settle Bill from a waiter) reaches an
 * open terminal within about a minute, far below any rate-limit concern for a single lightweight GET.
 */
function ServicePermissionsRefresher() {
  const status = useAuthStore((s) => s.status);
  const tenantID = useAuthStore((s) => s.user?.tenant_id);
  useEffect(() => {
    if (status !== 'authenticated' || !tenantID) return;
    const tick = () => { void useAuthStore.getState().refreshServicePermissions(); };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [status, tenantID]);
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
              data… (N)" driven by the real IndexedDB queue (SW registered by
              registerBackgroundSync), plus the shared PwaUpdater ("new version available" banner
              — a server build-fingerprint poll, since the committed static sw.js never changes
              bytes per deploy; fixed in shared-ui-lib v0.1.35 to actually detect Turbopack/App
              Router builds, which it never could before). */}
          <OfflineBar
            registerSW
            getPendingCount={async () => (await getSyncStatusCounts()).pending}
            onSyncNow={triggerSyncNow}
            availableOffline={['Sell', 'Cash & manual payments', 'Open/close drawer']}
            disabledOffline={['Card / M-Pesa STK', 'Live reports']}
          />
          {/* Floating pill kept for dead-letter review (failed items + manual retry). */}
          <SyncStatusIndicator />
          <BackgroundSyncWorker />
          <CatalogPrewarm />
          <OutletContextHealer />
          <ServicePermissionsRefresher />
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
            // Standard app shell. `fixed inset-0` (not h-screen) pins the shell to the true
            // viewport rather than the layout viewport — mobile Safari's address-bar-inclusive
            // 100vh made h-screen unreliable for a shell meant to feel like a native app.
            <div className="fixed inset-0 flex overflow-hidden bg-background">
              <Sidebar open={sidebarOpen} collapsed={sidebarCollapsed} onClose={() => setSidebarOpen(false)} />
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <Header
                  onMenuClick={() => setSidebarOpen(true)}
                  sidebarCollapsed={sidebarCollapsed}
                  onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
                />
                <SubscriptionBanner />
                {/* min-h-0 is required here: without it a flex child defaults to min-height:auto
                    and overflow-y-auto can never create a scroll context. */}
                <main className="flex-1 min-h-0 overflow-y-auto bg-accent/5">
                  <StartShiftGate>
                    {/* Bottom padding on mobile clears the fixed bottom nav bar. */}
                    <div className="min-h-full flex flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
                      {/* App-wide permission safety net: every classified route is gated by
                          the caller's permissions, incl. direct-URL nav. Fail-open for
                          unclassified routes; superusers bypass. */}
                      <div className="flex-1"><RouteGuard>{children}</RouteGuard></div>
                      <Footer />
                    </div>
                  </StartShiftGate>
                </main>
              </div>
              {/* App-style bottom navigation, phones only. */}
              <MobileBottomNav onOpenMenu={() => setSidebarOpen(true)} />
            </div>
          )}
          </SubscriptionEntitlementsProvider>
        </TenantBrandingProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
