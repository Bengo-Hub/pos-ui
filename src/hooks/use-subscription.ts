"use client";

import { useAuthStore } from "@/store/auth";
import type { SubscriptionInfo } from "@/lib/auth/subscription";
import { fetchSubscriptionInfo } from "@/lib/auth/subscription";
import { useSubscriptionStore } from "@/store/subscription";
import { isFeatureUnlocked, type SubscriptionEntitlements } from "@bengo-hub/shared-ui-lib/subscription";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

/** Shared query key prefix. Invalidate ['subscription'] to refresh every caller at once. */
export const SUBSCRIPTION_QUERY_KEY = 'subscription' as const;

const FIVE_MINUTES = 5 * 60 * 1000;

const EXEMPT_INFO: SubscriptionInfo = {
  status: 'active', planCode: 'enterprise', planName: 'Enterprise', features: [], limits: {},
};

/**
 * Reads the sub_exempt claim straight out of the access token (no signature verification,
 * purely to read a claim the SSO token already carries). The /me-derived `user` object never
 * carries this field, so this is the only reliable source client-side. Returns false on any
 * malformed/missing token.
 */
function decodeSubExempt(token: string | null | undefined): boolean {
  if (!token) return false;
  try {
    const part = token.split('.')[1];
    if (!part) return false;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = JSON.parse(atob(padded)) as Record<string, unknown>;
    return json?.sub_exempt === true;
  } catch {
    return false;
  }
}

/** Writes a successful lookup back to the auth store and the offline (IndexedDB) store. */
function persistInfo(info: SubscriptionInfo, slug: string) {
  useAuthStore.getState().setSubscriptionInfo(info as any);
  useSubscriptionStore.getState().setFromRaw(
    {
      plan: info.planCode || null, status: info.status || null,
      tierOrder: info.tierOrder ?? null,
      expiresAt: info.currentPeriodEnd ?? info.trialEndsAt ?? null,
      features: info.features, limits: info.limits,
    },
    slug,
  );
}

export function useSubscription() {
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const storedInfo = useAuthStore((s) => s.subscriptionInfo) as SubscriptionInfo | null | undefined;

  const subStore = useSubscriptionStore();

  const tenantSlug = user?.tenant_slug as string | undefined;
  const tenantId = user?.tenant_id as string | undefined;
  // Platform-owner-ness comes ONLY from the server-derived claim, never from the tenant slug.
  // PIN sessions get their gating exemption from the sub_exempt token claim below.
  const isPlatformOwner = !!(user as any)?.is_platform_owner || !!(user as any)?.isPlatformOwner;
  const isServiceCharge = (user as any)?.billing_mode === 'service_charge';
  const isDemo = !!(user as any)?.is_demo || tenantSlug === 'codevertex-demo';
  // Platform-granted per-tenant exemption (sub_exempt JWT claim).
  const isSubExempt = decodeSubExempt(session?.accessToken);
  const isExempt = isPlatformOwner || isDemo || isServiceCharge || isSubExempt;

  // The /api/subscription proxy authenticates with the server's service key, so the lookup needs
  // a signed-in profile, not a browser token (cookie sessions may not have mirrored one yet).
  // A known profile is enough: the auth status can sit on 'loading'/'syncing' while a cookie
  // session renews in the background, and waiting on it kept the KDS gate on skeletons.
  const authed = !!user && status !== 'error';
  // No tenant, platform owner or sub_exempt: no lookup, treated as an enterprise plan.
  const skipLookup = authed && (!tenantId || isPlatformOwner || isSubExempt);

  // Hydrate from IndexedDB on auth so gating works offline and first paint uses the cache.
  useEffect(() => {
    if (status !== 'authenticated' || !user) return;
    if (tenantSlug) useSubscriptionStore.getState().loadFromIDB(tenantSlug);
  }, [status, user, tenantSlug]);

  useEffect(() => {
    if (!skipLookup) return;
    if (useAuthStore.getState().subscriptionInfo?.planCode === 'enterprise') return;
    useAuthStore.getState().setSubscriptionInfo(EXEMPT_INFO as any);
    useSubscriptionStore.getState().setFromRaw(
      { plan: 'ENTERPRISE', status: 'ACTIVE', features: [], limits: {} }, tenantSlug ?? '',
    );
  }, [skipLookup, tenantSlug]);

  // One shared query for every caller. A failed lookup keeps the last good data (React Query
  // never clears data on error), so an active tenant is never locked out by a blip.
  const query = useQuery<SubscriptionInfo>({
    queryKey: [SUBSCRIPTION_QUERY_KEY, tenantId ?? ''],
    queryFn: async () => {
      const info = await fetchSubscriptionInfo(tenantId as string, tenantSlug ?? '', session?.accessToken ?? '');
      // null means the lookup failed, not "no subscription": throw so retry/backoff kicks in.
      if (info === null) throw new Error('subscription lookup failed');
      persistInfo(info, tenantSlug ?? '');
      return info;
    },
    enabled: authed && !skipLookup && !!tenantId,
    // First paint uses the in-memory value if this tab already has one; marked stale so it
    // revalidates in the background.
    initialData: () => (storedInfo && typeof storedInfo === 'object' ? storedInfo : undefined),
    initialDataUpdatedAt: 0,
    staleTime: FIVE_MINUTES,
    // While the lookup is failing, try again every 20s so the page recovers on its own as soon
    // as the service answers (a fixed key, a restarted pod) instead of waiting five minutes.
    refetchInterval: (q) => (q.state.status === 'error' ? 20_000 : FIVE_MINUTES),
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    // One quick retry, then the provider fails open (status 'unknown'), so a screen never sits
    // on a skeleton for long.
    retry: 1,
    retryDelay: 1500,
  });

  // Last known info from the offline store, used until the first lookup lands or when it fails.
  const cachedInfo = useMemo<SubscriptionInfo | undefined>(() => {
    if (!subStore.hydrated || !subStore.status) return undefined;
    return {
      status: String(subStore.status).toLowerCase(),
      planCode: (subStore.plan as string) ?? '',
      planName: '',
      tierOrder: subStore.tierOrder ?? undefined,
      features: subStore.features ?? [],
      limits: subStore.limits ?? {},
    };
  }, [subStore.hydrated, subStore.status, subStore.plan, subStore.tierOrder, subStore.features, subStore.limits]);

  let info: SubscriptionInfo | undefined;
  if (skipLookup) info = EXEMPT_INFO;
  else if (query.data) info = query.data;
  else if (storedInfo && typeof storedInfo === 'object') info = storedInfo;
  else if (cachedInfo) info = cachedInfo;
  // No cache and the lookup failed: 'unknown' is deliberately NOT 'none', so the tenant is
  // never locked out while the subscription service is unreachable.
  // The same when signed in but the lookup cannot run: a gate never waits on a query that will
  // not start.
  else if (query.isError || (authed && !query.isFetching && query.fetchStatus === 'idle' && query.isPending)) {
    info = { status: 'unknown', planCode: '', planName: '', features: [], limits: {} };
  }

  const subStatus = info?.status ?? null;

  // Entitlement snapshot for the shared tier-aware gate. Falls back to the offline store so
  // hasFeature/getLimit resolve identically offline.
  const entitlements: SubscriptionEntitlements = {
    features: info?.features ?? subStore.features ?? [],
    limits: (info?.limits ?? subStore.limits ?? {}) as Record<string, number>,
    isExempt,
    planCode: info?.planCode ?? subStore.plan ?? null,
    tierOrder: info?.tierOrder ?? subStore.tierOrder ?? null,
    catalog: subStore.catalog ?? {},
  };
  // Same snapshot without the isExempt bypass, for callers that need the tenant's own real
  // plan answer regardless of who is viewing.
  const realEntitlements: SubscriptionEntitlements = { ...entitlements, isExempt: false };

  return {
    info,
    status: subStatus,
    plan: info?.planCode ?? subStore.plan ?? null,
    tierOrder: info?.tierOrder ?? subStore.tierOrder ?? null,
    isActive: subStatus === 'active' || subStatus === 'trial' || isExempt,
    isPastDue: subStatus === 'past_due' || subStatus === 'suspended',
    isExpired: subStatus === 'expired' || subStatus === 'cancelled',
    needsSubscription: subStatus === 'none' && !isExempt,
    // True only when there is no value at all (no cache, no data yet).
    // An exempt viewer (platform owner, demo, service-charge, sub_exempt) is never waiting.
    isLoading: info === undefined && !isExempt,
    isPlatformOwner,
    isServiceCharge,
    isDemo,
    isSubExempt,
    // Tier-aware: unlocked when granted OR at/below the tenant's tier (same family) OR uncatalogued.
    hasFeature: (code: string) => isFeatureUnlocked(entitlements, code),
    // The tenant's own real entitlement, ignoring any viewer exemption.
    hasFeatureForTenant: (code: string) => isFeatureUnlocked(realEntitlements, code),
    getLimit: (key: string) =>
      isExempt ? Infinity : ((info?.limits?.[key] ?? subStore.limits?.[key] ?? Infinity) as number),
    daysUntilExpiry: subStore.daysUntilExpiry,
    isInGracePeriod: subStore.isInGracePeriod,
    gracePeriodEndsAt: subStore.gracePeriodEndsAt,
    // Product codes the tenant has self-activated (distinct from plan `features`).
    activeProducts: isExempt ? undefined : (info?.activeProducts ?? []),
    // Service tags the plan covers; undefined (all services shown) when exempt or not loaded yet.
    activeServiceTags: isExempt ? undefined : info?.activeServiceTags,
    store: subStore,
  };
}
