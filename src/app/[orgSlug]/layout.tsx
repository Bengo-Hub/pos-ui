'use client';

import { Header } from '@/components/header';
import { Sidebar } from '@/components/sidebar';
import { AuthProvider } from '@/providers/auth-provider';
import { TenantBrandingProvider } from '@/providers/tenant-branding-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { Footer } from '@/components/footer';
import { SubscriptionBanner } from '@/components/subscription/subscription-banner';
import { OfflineBanner } from '@/components/pos/offline-banner';
import { PWARegistration } from '@/components/pwa-registration';
import { PWAUpdateBanner } from '@/components/pwa-update-banner';
import { StartShiftGate } from '@/components/pos/start-shift-gate';
import { useSyncOfflineOrders } from '@/hooks/use-sync-offline-orders';
import { useEffect } from 'react';
import { registerBackgroundSync } from '@/lib/sw/register-sync';
import { usePathname, useParams } from 'next/navigation';

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

/** Paths that bypass the full app shell (no header/sidebar/footer). */
const KIOSK_PATHS = ['/pin-login'];

function isKioskRoute(pathname: string | null): boolean {
  return KIOSK_PATHS.some(p => pathname?.endsWith(p) || pathname?.includes(`${p}/`));
}

export default function OrgLayout({ children }: { children: ReactNode }) {
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
          <PWAUpdateBanner />
          <OfflineBanner />
          <OfflineSyncWorker />
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
