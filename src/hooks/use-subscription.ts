"use client";

import { useAuthStore } from "@/store/auth";
import type { SubscriptionInfo } from "@/lib/auth/subscription";
import { fetchSubscriptionInfo } from "@/lib/auth/subscription";
import { useSubscriptionStore } from "@/store/subscription";
import { useEffect } from "react";

export function useSubscription() {
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const subscriptionInfo = useAuthStore((s) => s.subscriptionInfo);
  const setSubscriptionInfo = useAuthStore((s) => s.setSubscriptionInfo);

  const subStore = useSubscriptionStore();

  const tenantSlug = user?.tenant_slug as string | undefined;
  const isPlatformOwner = !!(user as any)?.isPlatformOwner || tenantSlug === 'codevertex';

  // Hydrate from IndexedDB on auth so gating works offline
  useEffect(() => {
    if (status !== 'authenticated' || !user) return;
    const slug = tenantSlug ?? '';
    if (slug) useSubscriptionStore.getState().loadFromIDB(slug);
  }, [status, user, tenantSlug]);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.accessToken || !user) return;
    if (subscriptionInfo !== undefined) return;

    setSubscriptionInfo(null);

    const tenantId = user.tenant_id;
    const slug = tenantSlug ?? '';

    if (!tenantId || isPlatformOwner) {
      const platformInfo = {
        status: 'active', planCode: 'enterprise', planName: 'Enterprise', features: [], limits: {},
      };
      setSubscriptionInfo(platformInfo as any);
      useSubscriptionStore.getState().setFromRaw(
        { plan: 'ENTERPRISE', status: 'ACTIVE', features: [], limits: {} }, slug,
      );
      return;
    }

    // Quick-init from JWT tenant claims if available
    const tenant = (user as any).tenant as Record<string, any> | undefined;
    if (tenant?.subscription_status) {
      const quickInfo: SubscriptionInfo = {
        status: (tenant.subscription_status as string).toLowerCase(),
        planCode: (tenant.subscription_plan as string) ?? '',
        planName: (tenant.subscription_plan as string) ?? '',
        features: (tenant.subscription_features as string[]) ?? [],
        limits: (tenant.tier_limits as Record<string, number>) ?? {},
        trialEndsAt: tenant.subscription_expires_at as string | undefined,
        currentPeriodEnd: tenant.subscription_expires_at as string | undefined,
      };
      setSubscriptionInfo(quickInfo as any);
      useSubscriptionStore.getState().setFromRaw(
        {
          plan: quickInfo.planCode || null,
          status: quickInfo.status || null,
          expiresAt: (tenant.subscription_grace_ends_at as string) ?? quickInfo.currentPeriodEnd ?? null,
          features: quickInfo.features,
          limits: quickInfo.limits,
        },
        slug,
      );

      fetchSubscriptionInfo(tenantId, slug, session.accessToken)
        .then((info) => {
          if (!info) return;
          setSubscriptionInfo(info as any);
          useSubscriptionStore.getState().setFromRaw(
            {
              plan: info.planCode, status: info.status,
              expiresAt: info.currentPeriodEnd ?? info.trialEndsAt ?? null,
              features: info.features, limits: info.limits,
            },
            slug,
          );
        })
        .catch(() => {});
      return;
    }

    fetchSubscriptionInfo(tenantId, slug, session.accessToken)
      .then((info) => {
        const resolved = info ?? { status: 'none', planCode: '', planName: '', features: [], limits: {} };
        setSubscriptionInfo(resolved as any);
        useSubscriptionStore.getState().setFromRaw(
          {
            plan: resolved.planCode || null, status: resolved.status || null,
            expiresAt: (resolved as any).currentPeriodEnd ?? (resolved as any).trialEndsAt ?? null,
            features: resolved.features, limits: resolved.limits,
          },
          slug,
        );
      })
      .catch(() => setSubscriptionInfo({ status: 'none', planCode: '', planName: '', features: [], limits: {} } as any));
  }, [status, session?.accessToken, user, subscriptionInfo, setSubscriptionInfo, tenantSlug, isPlatformOwner]);

  const info = subscriptionInfo as SubscriptionInfo | null | undefined;
  const subStatus = info?.status ?? null;

  return {
    info,
    status: subStatus,
    plan: info?.planCode ?? null,
    isActive: subStatus === 'active' || subStatus === 'trial',
    isPastDue: subStatus === 'past_due' || subStatus === 'suspended',
    isExpired: subStatus === 'expired' || subStatus === 'cancelled',
    needsSubscription: subStatus === 'none',
    isLoading: subscriptionInfo === null || subscriptionInfo === undefined,
    isPlatformOwner,
    hasFeature: (code: string) => info?.features?.includes(code) ?? false,
    getLimit: (key: string) => (info?.limits?.[key] ?? Infinity) as number,
    daysUntilExpiry: subStore.daysUntilExpiry,
    isInGracePeriod: subStore.isInGracePeriod,
    gracePeriodEndsAt: subStore.gracePeriodEndsAt,
    store: subStore,
  };
}
