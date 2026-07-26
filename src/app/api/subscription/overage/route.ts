import { NextRequest, NextResponse } from 'next/server';

const PRICING_API =
  process.env.NEXT_PUBLIC_SUBSCRIPTIONS_API_URL ||
  'https://pricingapi.codevertexafrica.com';

const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY ?? '';

/**
 * Proxy the tenant's extra-usage (overage) opt-in switch + pending-overage view.
 * The browser never holds the service key; we resolve the tenant via X-Tenant-ID and
 * authenticate to pricing-api with X-API-Key (same pattern as /api/subscription).
 *
 *   GET  /api/subscription/overage?tenantId=<uuid>            → { allow_overage, pending_total_kes, breakdown }
 *   POST /api/subscription/overage?tenantId=<uuid> { enabled } → toggles allow_overage
 */
function upstreamHeaders(tenantId: string): HeadersInit {
  return { 'X-API-Key': SERVICE_KEY, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
  if (!SERVICE_KEY) return NextResponse.json({ error: 'service key not configured' }, { status: 503 });

  try {
    const upstream = await fetch(`${PRICING_API}/api/v1/subscription/overage`, {
      headers: upstreamHeaders(tenantId),
      cache: 'no-store',
    });
    const data = await upstream.json().catch(() => null);
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(null, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
  if (!SERVICE_KEY) return NextResponse.json({ error: 'service key not configured' }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const enabled = !!body?.enabled;
  const path = enabled ? 'enable' : 'disable';

  try {
    const upstream = await fetch(`${PRICING_API}/api/v1/subscription/overage/${path}`, {
      method: 'POST',
      headers: upstreamHeaders(tenantId),
    });
    const data = await upstream.json().catch(() => null);
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(null, { status: 503 });
  }
}
