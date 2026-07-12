/**
 * Subscription information fetched lazily after login.
 * Used for UI-level feature gating (banners, lock icons, upgrade modals).
 * Login is NEVER blocked by subscription state — backend enforces on mutations.
 */

export interface SubscriptionInfo {
  status: string;
  planCode: string;
  planName: string;
  /** Tier rank of the resolved plan (1=Starter,2=Growth,3=Professional). Powers tier-aware gating. */
  tierOrder?: number;
  features: string[];
  limits: Record<string, number>;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
}

/**
 * Fetches full subscription info for a tenant via the local proxy at /api/subscription.
 * The proxy uses INTERNAL_SERVICE_KEY (server-side only) to call the pricing-api S2S
 * endpoint — the browser never sends the service key directly.
 * Returns null on any error (CORS, network, timeout) — fail open.
 */
export async function fetchSubscriptionInfo(
  tenantId: string,
  _tenantSlug: string,
  _accessToken: string,
): Promise<SubscriptionInfo | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(`/api/subscription?tenantId=${encodeURIComponent(tenantId)}`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) return null;

    const data = await resp.json();
    if (!data) return null;

    const sub = data?.subscription ?? data;

    return {
      status: (sub.status ?? "none").toLowerCase(),
      planCode: sub.plan_code ?? sub.planCode ?? "",
      planName: sub.plan_name ?? sub.planName ?? "",
      tierOrder: sub.tier_order ?? sub.tierOrder,
      features: sub.features ?? [],
      limits: sub.limits ?? {},
      trialEndsAt: sub.trial_ends_at ?? sub.trialEndsAt,
      currentPeriodEnd: sub.current_period_end ?? sub.currentPeriodEnd,
    };
  } catch {
    return null;
  }
}

export interface OverageStatus {
  allowOverage: boolean;
  pendingTotalKes: number;
  breakdown: Array<{
    metric_type: string;
    period_date: string;
    units_over: number;
    plan_limit: number;
    unit_price_kes: number;
    total_charge_kes: number;
  }>;
}

/** Reads the tenant's extra-usage opt-in flag + pending overage via the local proxy. */
export async function fetchOverageStatus(tenantId: string): Promise<OverageStatus | null> {
  try {
    const resp = await fetch(`/api/subscription/overage?tenantId=${encodeURIComponent(tenantId)}`, {
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data) return null;
    return {
      allowOverage: !!data.allow_overage,
      pendingTotalKes: Number(data.pending_total_kes) || 0,
      breakdown: data.breakdown ?? [],
    };
  } catch {
    return null;
  }
}

/** Enables/disables pay-as-you-go extra usage for the tenant. Returns true on success. */
export async function setOverageEnabled(tenantId: string, enabled: boolean): Promise<boolean> {
  try {
    const resp = await fetch(`/api/subscription/overage?tenantId=${encodeURIComponent(tenantId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
