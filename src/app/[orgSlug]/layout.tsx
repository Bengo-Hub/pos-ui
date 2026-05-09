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
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { useSyncOfflineOrders } from '@/hooks/use-sync-offline-orders';
import { useEffect } from 'react';
import { registerBackgroundSync } from '@/lib/sw/register-sync';

function OfflineSyncWorker() {
  useSyncOfflineOrders();
  useEffect(() => { registerBackgroundSync(); }, []);
  return null;
}

export default function OrgLayout({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,     // 5 min — most data is reference/moderate
            gcTime: 10 * 60 * 1000,        // 10 min garbage collection
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TenantBrandingProvider>
      <OfflineBanner />
      <OfflineSyncWorker />
      <InstallPrompt />
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <SubscriptionBanner />
          <main className="flex-1 overflow-y-auto bg-accent/5">
            <div className="min-h-full flex flex-col">
              <div className="flex-1">{children}</div>
              <Footer />
            </div>
          </main>
        </div>
      </div>
      </TenantBrandingProvider>
    </AuthProvider>
    </QueryClientProvider>
  );
}
