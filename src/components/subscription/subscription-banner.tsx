'use client';

import { SubscriptionBanner as SharedSubscriptionBanner } from '@bengo-hub/shared-ui-lib/subscription';
import { useSubscription } from '@/hooks/use-subscription';

const SUBSCRIPTIONS_UI_URL =
  process.env.NEXT_PUBLIC_SUBSCRIPTIONS_UI_URL || 'https://pricing.codevertexitsolutions.com';

const UPGRADE_URL = `${SUBSCRIPTIONS_UI_URL}/plans?service=pos`;
const BILLING_URL = `${SUBSCRIPTIONS_UI_URL}/billing`;

export function SubscriptionBanner() {
  const sub = useSubscription();
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
      isCommercialTenant={!sub.isPlatformOwner}
      isLoading={sub.isLoading}
      isHydrated={sub.store.hydrated}
      upgradeUrl={UPGRADE_URL}
      billingUrl={BILLING_URL}
    />
  );
}
