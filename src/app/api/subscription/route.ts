import { NextRequest, NextResponse } from 'next/server';

const PRICING_API =
  process.env.NEXT_PUBLIC_SUBSCRIPTIONS_API_URL ||
  'https://pricingapi.codevertexitsolutions.com';

const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY ?? '';

/**
 * Proxy subscription lookup via service key so the browser never needs
 * to call the pricing-api directly (which requires X-API-Key, not Bearer).
 * GET /api/subscription?tenantId=<uuid>
 */
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
  }

  if (!SERVICE_KEY) {
    return NextResponse.json({ error: 'service key not configured' }, { status: 503 });
  }

  try {
    const upstream = await fetch(
      `${PRICING_API}/api/v1/tenants/${tenantId}/subscription`,
      {
        headers: { 'X-API-Key': SERVICE_KEY },
        next: { revalidate: 60 },
      },
    );

    if (!upstream.ok) {
      return NextResponse.json(null, { status: upstream.status });
    }

    const data = await upstream.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(null, { status: 503 });
  }
}
