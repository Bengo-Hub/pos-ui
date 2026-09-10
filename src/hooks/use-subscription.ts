"use client";

import { useAuthStore } from "@/store/auth";
import type { SubscriptionInfo } from "@/lib/auth/subscription";
import { fetchSubscriptionInfo } from "@/lib/auth/subscription";
import { useSubscriptionStore } from "@/store/subscription";
import { isFeatureUnlocked, type SubscriptionEntitlements } from "@bengo-hub/shared-ui-lib/subscription";
import { useEffect, useRef } from "react";

/**
 * Reads the sub_exempt claim straight out of the access token (no signature verification —
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

export function useSubscription() {
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const subscriptionInfo = useAuthStore((s) => s.subscriptionInfo);
  const setSubscriptionInfo = useAuthStore((s) => s.setSubscriptionInfo);

  const subStore = useSubscriptionStore();
  // Bounded retry counter for a FAILED subscription lookup (see the fetch effect). Reset per auth.
  const lookupRetries = useRef(0);

  const tenantSlug = user?.tenant_slug as string | undefined;
  // Platform-owner-ness comes ONLY from the server-derived flag (+ the codevertex slug as a
  // defensive fallback) — a tenant superuser/admin is NOT a platform owner and must not bypass
  // subscription gating (platform SEC-3 policy: otherwise any tenant admin unlocks paid features
  // for free). `roles` is intentionally unused here now; it still drives real RBAC elsewhere.
  const isPlatformOwner = !!(user as any)?.is_platform_owner || !!(user as any)?.isPlatformOwner || tenantSlug === 'codevertex';
  const isServiceCharge = (user as any)?.billing_mode === 'service_charge';
  const isDemo = !!(user as any)?.is_demo || tenantSlug === 'codevertex-demo';
  // Platform-granted per-tenant exemption (sub_exempt JWT claim) — decoded straight from the
  // access token since it's never round-tripped onto the /me-derived `user` object here. Without
  // this, marking a tenant subscription-exempt could never actually unblock a non-admin user of
  // that tenant in this app: only isSuperuser/isPlatformOwner ever bypassed before.
  const isSubExempt = decodeSubExempt(session?.accessToken);
  const isExempt = isPlatformOwner || isDemo || isServiceCharge || isSubExempt;

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

    // A FAILED lookup (network/5xx/timeout) is NOT the same as "no subscription".
    // fetchSubscriptionInfo returns null ONLY on failure — never collapse that to
    // status:'none', which would trigger the full-page "Subscription Required" lockout for
    // a genuinely-active tenant (e.g. while subscription-api is mid-redeploy). Instead FAIL
    // OPEN: keep the last-known-good cached entitlements (so active tenants stay in), else a
    // non-blocking 'unknown' status; and retry a few times so it self-heals when the API returns.
    const handleLookupFailure = () => {
      const cached = useSubscriptionStore.getState();
      if (cached.hydrated && cached.status) {
        setSubscriptionInfo({
          status: String(cached.status).toLowerCase(),
          planCode: (cached.plan as string) ?? '',
          planName: '',
          tierOrder: (cached.tierOrder as number) ?? undefined,
          features: cached.features ?? [],
          limits: cached.limits ?? {},
        } as any);
      } else {
        // No cache yet: 'unknown' is deliberately NOT 'none', so needsSubscription stays false
        // and the tenant is never locked out on a transient lookup failure.
        setSubscriptionInfo({ status: 'unknown', planCode: '', planName: '', features: [], limits: {} } as any);
      }
      if (lookupRetries.current < 4) {
        lookupRetries.current += 1;
        // Re-arm the effect (subscriptionInfo → undefined) after a short delay to re-fetch.
        setTimeout(() => setSubscriptionInfo(undefined as any), 8000);
      }
    };

    fetchSubscriptionInfo(tenantId, slug, session.accessToken)
      .then((info) => {
        if (info === null) {
          handleLookupFailure();
          return;
        }
        lookupRetries.current = 0;
        setSubscriptionInfo(info as any);
        useSubscriptionStore.getState().setFromRaw(
          {
            plan: info.planCode || null, status: info.status || null,
            tierOrder: (info as any).tierOrder ?? null,
            expiresAt: (info as any).currentPeriodEnd ?? (info as any).trialEndsAt ?? null,
            features: info.features, limits: info.limits,
          },
          slug,
        );
      })
      .catch(() => handleLookupFailure());
  }, [status, session?.accessToken, user, subscriptionInfo, setSubscriptionInfo, tenantSlug, isPlatformOwner]);

  // Defense-in-depth freshness, independent of the real-time WS push (use-notification-stream's
  // "entitlements_changed" handler already re-arms this on a grant/revoke/plan change — this is
  // the fallback for when that socket is reconnecting or unavailable): re-check at most once a
  // minute, and whenever the tab regains focus/visibility, so a stale add-on/plan state never
  // survives longer than a beat once the terminal or back-office tab is actually looked at again.
  useEffect(() => {
    if (status !== 'authenticated' || !session?.accessToken || !user) return;
    const rearm = () => setSubscriptionInfo(undefined as any);
    const interval = setInterval(rearm, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') rearm(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', rearm);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', rearm);
    };
  }, [status, session?.accessToken, user, setSubscriptionInfo]);

  const info = subscriptionInfo as SubscriptionInfo | null | undefined;
  const subStatus = info?.status ?? null;

  // Entitlement snapshot for the SHARED tier-aware gate. Falls back to the offline store so
  // hasFeature/getLimit resolve identically offline (info comes from IDB via setFromRaw/loadFromIDB).
  const entitlements: SubscriptionEntitlements = {
    features: info?.features ?? subStore.features ?? [],
    limits: (info?.limits ?? subStore.limits ?? {}) as Record<string, number>,
    isExempt,
    planCode: info?.planCode ?? subStore.plan ?? null,
    tierOrder: info?.tierOrder ?? subStore.tierOrder ?? null,
    catalog: subStore.catalog ?? {},
  };

  return {
    info,
    status: subStatus,
    plan: info?.planCode ?? subStore.plan ?? null,
    tierOrder: info?.tierOrder ?? subStore.tierOrder ?? null,
    isActive: subStatus === 'active' || subStatus === 'trial' || isExempt,
    isPastDue: subStatus === 'past_due' || subStatus === 'suspended',
    isExpired: subStatus === 'expired' || subStatus === 'cancelled',
    needsSubscription: subStatus === 'none' && !isExempt,
    isLoading: subscriptionInfo === null || subscriptionInfo === undefined,
    isPlatformOwner,
    isServiceCharge,
    isDemo,
    // Tier-aware: unlocked when granted OR at/below the tenant's tier (same family) OR uncatalogued.
    hasFeature: (code: string) => isFeatureUnlocked(entitlements, code),
    getLimit: (key: string) =>
      isExempt ? Infinity : ((info?.limits?.[key] ?? subStore.limits?.[key] ?? Infinity) as number),
    daysUntilExpiry: subStore.daysUntilExpiry,
    isInGracePeriod: subStore.isInGracePeriod,
    gracePeriodEndsAt: subStore.gracePeriodEndsAt,
    // Product codes the tenant has actually self-activated (distinct from `features`, which is
    // plan entitlement — a tenant can be entitled to a product and still have turned it off).
    // Exempt tenants (platform owner/demo/service-charge) see every app.
    activeProducts: isExempt ? undefined : (info?.activeProducts ?? []),
    store: subStore,
  };
}
