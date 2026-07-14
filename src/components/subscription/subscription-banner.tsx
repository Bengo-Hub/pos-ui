'use client';

import { SubscriptionBanner as SharedSubscriptionBanner } from '@bengo-hub/shared-ui-lib/subscription';
import { useSubscription } from '@/hooks/use-subscription';
import { useUsageAlerts } from '@/hooks/use-usage-alerts';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { useAuthStore } from '@/store/auth';

const SUBSCRIPTIONS_UI_URL =
  process.env.NEXT_PUBLIC_SUBSCRIPTIONS_UI_URL || 'https://pricing.codevertexitsolutions.com';

const UPGRADE_URL = `${SUBSCRIPTIONS_UI_URL}/plans?service=pos`;
const BILLING_URL = `${SUBSCRIPTIONS_UI_URL}/billing`;

export function SubscriptionBanner() {
  const sub = useSubscription();
  const usageAlerts = useUsageAlerts();
  const { tenant } = useTenantBranding();
  const user = useAuthStore((s) => s.user);
  const brandColor = tenant?.primaryColor ?? undefined;
  // A paid ONE_TIME (perpetual) licence never renews and has nothing to upgrade to — driven from
  // the auth JWT's real billing mode claim (subscriptions enrichment), never a hardcoded plan list.
  const isPerpetual = (user as any)?.billing_mode === 'one_time';
  return (
    <SharedSubscriptionBanner
      status={sub.status}
      plan={sub.store.plan}
      isExpired={sub.store.isExpired}
      isInGracePeriod={sub.store.isInGracePeriod}
      expiresAt={sub.store.expiresAt}
      gracePeriodEndsAt={sub.store.gracePeriodEndsAt}
      daysUntilExpiry={sub.store.daysUntilExpiry}
      needsSubscription={sub.needsSubscription}
      isPlatformOwner={sub.isPlatformOwner}
      isServiceCharge={sub.isServiceCharge}
      isDemo={sub.isDemo}
      isPerpetual={isPerpetual}
      isCommercialTenant={!sub.isPlatformOwner}
      isLoading={sub.isLoading}
      isHydrated={sub.store.hydrated}
      upgradeUrl={UPGRADE_URL}
      billingUrl={BILLING_URL}
      usageAlerts={usageAlerts}
      brandColor={brandColor}
    />
  );
}
