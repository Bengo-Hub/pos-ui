/**
 * Subscription information fetched lazily after login.
 * Used for UI-level feature gating (banners, lock icons, upgrade modals).
 * Login is NEVER blocked by subscription state — backend enforces on mutations.
 */

export interface SubscriptionInfo {
  status: string;
  planCode: string;
  planName: string;
  features: string[];
  limits: Record<string, number>;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
}

/**
 * Fetches full subscription info for a tenant.
 * Returns null on any error (CORS, network, timeout) — fail open.
 * This is called lazily AFTER login, never during the auth callback.
 */
export async function fetchSubscriptionInfo(
  tenantId: string,
  tenantSlug: string,
  accessToken: string,
): Promise<SubscriptionInfo | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SUBSCRIPTIONS_API_URL ||
    "https://pricingapi.codevertexitsolutions.com";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(`${baseUrl}/api/v1/subscription`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Tenant-ID": tenantId,
        "X-Tenant-Slug": tenantSlug,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) return null;

    const data = await resp.json();
    const sub = data?.subscription ?? data;

    return {
      status: (sub.status ?? "none").toLowerCase(),
      planCode: sub.plan_code ?? sub.planCode ?? "",
      planName: sub.plan_name ?? sub.planName ?? "",
      features: sub.features ?? [],
      limits: sub.limits ?? {},
      trialEndsAt: sub.trial_ends_at ?? sub.trialEndsAt,
      currentPeriodEnd: sub.current_period_end ?? sub.currentPeriodEnd,
    };
  } catch {
    return null;
  }
}
