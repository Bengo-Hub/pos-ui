'use client';

import { useAuthStore } from '@/store/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { useSubscription } from '@/hooks/use-subscription';
import { DevicesTab } from '@/components/settings/DevicesTab';
import { SubscriptionTab } from '@/components/settings/SubscriptionTab';
import { IntegrationsTab } from '@/components/settings/IntegrationsTab';
import { Badge } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { Key, Link2, Monitor, Shield } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/* ─── Types ──────────────────────────────────────────────────────────── */

type TabKey = 'devices' | 'licenses' | 'integrations';

/* ─── Page ───────────────────────────────────────────────────────────── */

/**
 * PlatformPage hosts ONLY platform-specific concerns: device provisioning and subscription
 * licensing. Everything that configures outlet behaviour (outlet config, KDS stations, tax,
 * modules) now lives solely on the tenant Settings page — platform admins reach it there too,
 * so we no longer duplicate those tabs here. Non-platform admins are redirected to Settings,
 * where they get a read-only view of their licence and linked devices.
 */
export default function PlatformPage() {
  const user = useAuthStore((state) => state.user);
  const { isSuperuser } = usePermissions();
  const { isSuperUser } = useModuleAccess();
  const { isPlatformOwner: isSubPlatform } = useSubscription();
  const router = useRouter();
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const searchParams = useSearchParams();

  const isPlatformOwner =
    isSuperuser || isSuperUser || isSubPlatform || user?.isPlatformOwner || user?.isSuperUser || orgSlug === 'codevertex';

  const [activeTab, setActiveTab] = useState<TabKey>('devices');

  useEffect(() => {
    const raw = searchParams?.get('tab') as TabKey | null;
    if (raw === 'devices' || raw === 'licenses' || raw === 'integrations') setActiveTab(raw);
  }, [searchParams]);

  // Platform management is platform-owner only. Tenant admins/managers see their licence and
  // devices read-only under Settings, so send them there instead of showing an empty page.
  useEffect(() => {
    if (user && !isPlatformOwner) {
      router.replace(`/${orgSlug}/settings`);
    }
  }, [user, isPlatformOwner, orgSlug, router]);

  if (!user || !isPlatformOwner) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto opacity-30" />
          <p className="text-sm text-muted-foreground">Redirecting…</p>
        </div>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; icon: typeof Monitor }[] = [
    { key: 'devices', label: 'Devices', icon: Monitor },
    { key: 'licenses', label: 'Licenses', icon: Key },
    { key: 'integrations', label: 'Integrations', icon: Link2 },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="warning">Platform Admin</Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Platform Management</h1>
        <p className="text-muted-foreground mt-1">
          Device provisioning, subscription licensing, and integrations. Outlet behaviour is configured under{' '}
          <button
            type="button"
            onClick={() => router.push(`/${orgSlug}/settings`)}
            className="underline hover:text-foreground"
          >
            Settings
          </button>
          .
        </p>
      </div>

      {/* ─── Tab Bar (top-nav) ───────────────────────────────────────── */}
      <div className="flex flex-wrap bg-accent/30 p-1 rounded-lg w-fit gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-all',
                activeTab === tab.key
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 inline mr-1.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'devices' && <DevicesTab />}
      {activeTab === 'licenses' && <SubscriptionTab />}
      {activeTab === 'integrations' && <IntegrationsTab />}
    </div>
  );
}
