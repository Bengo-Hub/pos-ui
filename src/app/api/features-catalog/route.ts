import { NextResponse } from 'next/server';

const PRICING_API =
  process.env.NEXT_PUBLIC_SUBSCRIPTIONS_API_URL ||
  'https://pricingapi.codevertexitsolutions.com';

const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY ?? '';

/**
 * Proxy the platform feature catalog (with the minPlanCode/minTierLabel each feature unlocks) so the
 * shared SubscriptionProvider can render "Upgrade to <tier>" without a hardcoded per-app map.
 * GET /api/features-catalog
 */
export async function GET() {
  try {
    const upstream = await fetch(`${PRICING_API}/api/v1/features/catalog`, {
      headers: SERVICE_KEY ? { 'X-API-Key': SERVICE_KEY } : {},
      next: { revalidate: 3600 },
    });
    if (!upstream.ok) return NextResponse.json({ features: [] }, { status: upstream.status });
    return NextResponse.json(await upstream.json());
  } catch {
    return NextResponse.json({ features: [] }, { status: 503 });
  }
}
