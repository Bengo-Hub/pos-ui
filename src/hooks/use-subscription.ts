"use client";

import { useAuthStore } from "@/store/auth";
import type { SubscriptionInfo } from "@/lib/auth/subscription";
import { fetchSubscriptionInfo } from "@/lib/auth/subscription";
import { useSubscriptionStore } from "@/store/subscription";
import { isFeatureUnlocked, type SubscriptionEntitlements } from "@bengo-hub/shared-ui-lib/subscription";
import { useEffect } from "react";

/**
 * Reads the sub_exempt claim straight out of the access token (no signature verification —
 * purely to read a claim the SSO token already carries). The /me-derived `user` object never
 * carries this field, so this is the only reliable source client-side. Returns false on any
 * malformed/missing token.
 */
// ─── One lookup for the whole app ────────────────────────────────────────────
// useSubscription runs in dozens of components at once. Each used to own its lookup, its 60s
// timer and its focus listener, and re-checking meant resetting subscriptionInfo to undefined.
// So every re-check fired one /api/subscription request per mounted component (a flood) and
// flipped isLoading to true, which made every FeatureGate render nothing: the whole page went
// blank for a moment every minute and on every tab focus. Now there is one in-flight lookup
// at a time, background re-checks are spaced out, and a re-check keeps the current answer on
// screen until the new one arrives.

const MIN_RECHECK_MS = 30_000;
const MAX_FAILURE_RETRIES = 4;
let inflight: Promise<void> | null = null;
let lastLookupAt = 0;
let failureRetries = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

interface LookupContext {
  tenantId: string;
  slug: string;
  token: string;
}

/** Fail open on a failed lookup: keep the current answer, else the cached one, else 'unknown'. */
function applyLookupFailure(ctx: LookupContext) {
  const { subscriptionInfo, setSubscriptionInfo } = useAuthStore.getState();
  if (!subscriptionInfo) {
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
      // 'unknown' is deliberately NOT 'none': a transient failure never locks the tenant out.
      setSubscriptionInfo({ status: 'unknown', planCode: '', planName: '', features: [], limits: {} } as any);
    }
  }
  if (failureRetries < MAX_FAILURE_RETRIES && !retryTimer) {
    failureRetries += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void lookupSubscription(ctx, true);
    }, 8000);
  }
}

/**
 * Loads the tenant's subscription once for every caller. A forced call (first load, a retry,
 * an entitlements_changed push) still joins an in-flight lookup; an unforced background
 * re-check is skipped when the last one finished under MIN_RECHECK_MS ago.
 */
export function lookupSubscription(ctx: LookupContext, force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && Date.now() - lastLookupAt < MIN_RECHECK_MS) return Promise.resolve();
  inflight = fetchSubscriptionInfo(ctx.tenantId, ctx.slug, ctx.token)
    .then((info) => {
      if (info === null) {
        applyLookupFailure(ctx);
        return;
      }
      failureRetries = 0;
      useAuthStore.getState().setSubscriptionInfo(info as any);
      useSubscriptionStore.getState().setFromRaw(
        {
          plan: info.planCode || null, status: info.status || null,
          tierOrder: (info as any).tierOrder ?? null,
          expiresAt: (info as any).currentPeriodEnd ?? (info as any).trialEndsAt ?? null,
          features: info.features, limits: info.limits,
        },
        ctx.slug,
      );
    })
    .catch(() => applyLookupFailure(ctx))
    .finally(() => {
      lastLookupAt = Date.now();
      inflight = null;
    });
  return inflight;
}

/** Re-check entitlements in the background (keeps the current answer on screen). */
export function refreshSubscriptionNow() {
  const { user, session } = useAuthStore.getState();
  const tenantId = user?.tenant_id as string | undefined;
  if (!tenantId || !session?.accessToken) return;
  void lookupSubscription(
    { tenantId, slug: (user?.tenant_slug as string | undefined) ?? '', token: session.accessToken },
    true,
  );
}

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

  const tenantSlug = user?.tenant_slug as string | undefined;
  // Platform-owner-ness comes ONLY from the server-derived claim, never from the tenant slug —
  // a tenant superuser/admin (or a terminal on the platform tenant) is NOT a platform owner and
  // must not bypass subscription gating. PIN sessions get their gating exemption from the
  // sub_exempt token claim below. `roles` still drives real RBAC elsewhere.
  const isPlatformOwner = !!(user as any)?.is_platform_owner || !!(user as any)?.isPlatformOwner;
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

    if (!tenantId || isPlatformOwner || isSubExempt) {
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
    // The first load for every mounted caller is one shared lookup (see lookupSubscription).
    void lookupSubscription({ tenantId, slug, token: session.accessToken }, true);
  }, [status, session?.accessToken, user, subscriptionInfo, setSubscriptionInfo, tenantSlug, isPlatformOwner, isSubExempt]);

  // Defense-in-depth freshness, independent of the real-time WS push (use-notification-stream's
  // "entitlements_changed" handler already re-arms this on a grant/revoke/plan change — this is
  // the fallback for when that socket is reconnecting or unavailable): re-check at most once a
  // minute, and whenever the tab regains focus/visibility, so a stale add-on/plan state never
  // survives longer than a beat once the terminal or back-office tab is actually looked at again.
  // Re-checks run in the background: the current answer stays on screen and every mounted
  // caller shares one request at most every MIN_RECHECK_MS (lookupSubscription).
  const canRecheck = status === 'authenticated' && !!session?.accessToken && !!user?.tenant_id && !isPlatformOwner && !isSubExempt;
  useEffect(() => {
    if (!canRecheck) return;
    const recheck = () => {
      const s = useAuthStore.getState();
      const tid = s.user?.tenant_id as string | undefined;
      if (!tid || !s.session?.accessToken) return;
      void lookupSubscription({ tenantId: tid, slug: (s.user?.tenant_slug as string | undefined) ?? '', token: s.session.accessToken });
    };
    const interval = setInterval(recheck, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') recheck(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', recheck);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', recheck);
    };
  }, [canRecheck]);

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
  // Same entitlement snapshot but WITHOUT the isExempt bypass — for the rare case a caller needs
  // the tenant's own real plan answer regardless of who's viewing (e.g. deciding which dashboard
  // variant to render). isExempt exists so platform owners/demo/service-charge tenants can still
  // NAVIGATE into and manage any feature; it should never make a business's own dashboard/data lie
  // about what that business is actually entitled to (a platform owner browsing a tenant's outlet
  // must see the same "no hotel module" reality that tenant sees, not an exempted illusion of it).
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
    isLoading: subscriptionInfo === null || subscriptionInfo === undefined,
    isPlatformOwner,
    isServiceCharge,
    isDemo,
    // Tier-aware: unlocked when granted OR at/below the tenant's tier (same family) OR uncatalogued.
    hasFeature: (code: string) => isFeatureUnlocked(entitlements, code),
    // The tenant's own real entitlement, ignoring any viewer exemption — see realEntitlements above.
    hasFeatureForTenant: (code: string) => isFeatureUnlocked(realEntitlements, code),
    getLimit: (key: string) =>
      isExempt ? Infinity : ((info?.limits?.[key] ?? subStore.limits?.[key] ?? Infinity) as number),
    daysUntilExpiry: subStore.daysUntilExpiry,
    isInGracePeriod: subStore.isInGracePeriod,
    gracePeriodEndsAt: subStore.gracePeriodEndsAt,
    // Product codes the tenant has actually self-activated (distinct from `features`, which is
    // plan entitlement — a tenant can be entitled to a product and still have turned it off).
    // Exempt tenants (platform owner/demo/service-charge) see every app.
    activeProducts: isExempt ? undefined : (info?.activeProducts ?? []),
    // Service tags the plan covers; undefined (all services shown) when exempt or not loaded yet.
    activeServiceTags: isExempt ? undefined : info?.activeServiceTags,
    store: subStore,
  };
}
