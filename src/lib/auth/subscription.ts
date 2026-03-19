/**
 * Checks whether a tenant has an active or trial subscription.
 * Returns true (allow) if the check fails due to network errors — fail open.
 * Returns false if subscription is missing or expired.
 */
export async function checkSubscription(
    tenantId: string,
    tenantSlug: string,
    accessToken: string
): Promise<boolean> {
    const baseUrl =
        process.env.NEXT_PUBLIC_SUBSCRIPTIONS_API_URL ||
        'https://pricingapi.codevertexitsolutions.com';

    try {
        const resp = await fetch(`${baseUrl}/api/v1/subscription`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'X-Tenant-ID': tenantId,
                'X-Tenant-Slug': tenantSlug,
                'Content-Type': 'application/json',
            },
        });

        if (resp.status === 404) return false; // no subscription record
        if (!resp.ok) return true; // fail open on unexpected errors

        const sub: { status?: string } = await resp.json();
        const s = (sub.status ?? '').toUpperCase();
        return s === 'ACTIVE' || s === 'TRIAL';
    } catch {
        return true; // fail open on network errors
    }
}
