"use client";

import { useAuthStore } from "@/store/auth";
import type { SubscriptionInfo } from "@/lib/auth/subscription";
import { fetchSubscriptionInfo } from "@/lib/auth/subscription";
import { useEffect } from "react";

/**
 * Hook for accessing subscription state and feature gating.
 * Subscription is loaded lazily after authentication — never blocks login.
 */
export function useSubscription() {
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const subscriptionInfo = useAuthStore((s) => s.subscriptionInfo);
  const setSubscriptionInfo = useAuthStore((s) => s.setSubscriptionInfo);

  useEffect(() => {
    if (status !== "authenticated" || !session?.accessToken || !user) return;
    if (subscriptionInfo !== undefined) return;

    setSubscriptionInfo(null);

    const tenantId = user.tenant_id;
    const tenantSlug = user.tenant_slug;

    if (!tenantId || tenantSlug === "codevertex") {
      setSubscriptionInfo({
        status: "active",
        planCode: "enterprise",
        planName: "Enterprise",
        features: [],
        limits: {},
      } as any);
      return;
    }

    fetchSubscriptionInfo(tenantId, tenantSlug ?? "", session.accessToken)
      .then((info) => setSubscriptionInfo((info ?? { status: "none", planCode: "", planName: "", features: [], limits: {} }) as any))
      .catch(() => setSubscriptionInfo({ status: "none", planCode: "", planName: "", features: [], limits: {} } as any));
  }, [status, session?.accessToken, user, subscriptionInfo, setSubscriptionInfo]);

  const info = subscriptionInfo as SubscriptionInfo | null | undefined;
  const subStatus = info?.status ?? null;

  return {
    info,
    status: subStatus,
    plan: info?.planCode ?? null,
    isActive: subStatus === "active" || subStatus === "trial",
    isPastDue: subStatus === "past_due" || subStatus === "suspended",
    isExpired: subStatus === "expired" || subStatus === "cancelled",
    needsSubscription: subStatus === "none",
    isLoading: subscriptionInfo === null || subscriptionInfo === undefined,
    hasFeature: (code: string) => info?.features?.includes(code) ?? false,
    getLimit: (key: string) => info?.limits?.[key] ?? Infinity,
  };
}
