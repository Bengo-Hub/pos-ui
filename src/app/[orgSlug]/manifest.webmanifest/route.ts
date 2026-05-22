import { type NextRequest, NextResponse } from 'next/server';

const AUTH_API_BASE =
  process.env.NEXT_PUBLIC_SSO_URL ||
  process.env.NEXT_PUBLIC_AUTH_API_URL ||
  'https://sso.codevertexitsolutions.com';

const DEFAULT_PRIMARY = '#ea8022';
const DEFAULT_BG = '#1c0f02';

interface TenantBrandColors {
  primary?: string;
  secondary?: string;
}

interface TenantResponse {
  name?: string;
  slug?: string;
  logo_url?: string;
  brand_colors?: TenantBrandColors;
  metadata?: Record<string, string | undefined>;
}

async function fetchTenant(slug: string): Promise<TenantResponse | null> {
  try {
    const res = await fetch(
      `${AUTH_API_BASE}/api/v1/tenants/by-slug/${encodeURIComponent(slug)}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    return res.json() as Promise<TenantResponse>;
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const tenant = await fetchTenant(orgSlug);

  const name = tenant?.name ?? 'Codevertex';
  const primaryColor =
    tenant?.brand_colors?.primary ??
    (tenant?.metadata?.primary_color as string | undefined) ??
    DEFAULT_PRIMARY;
  const bgColor =
    tenant?.brand_colors?.secondary ??
    (tenant?.metadata?.secondary_color as string | undefined) ??
    DEFAULT_BG;
  const logoUrl = tenant?.logo_url ?? (tenant?.metadata?.logo_url as string | undefined);

  const icons = logoUrl
    ? [
        { src: logoUrl, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: logoUrl, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ]
    : [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ];

  const manifest = {
    name: `${name} POS`,
    short_name: name,
    description: 'Fast, offline-ready Point of Sale for your business.',
    start_url: `/${orgSlug}/`,
    scope: `/${orgSlug}/`,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: bgColor,
    theme_color: primaryColor,
    categories: ['business', 'productivity'],
    lang: 'en',
    icons,
    shortcuts: [
      {
        name: 'New Order',
        short_name: 'Order',
        description: 'Start a new POS order',
        url: `/${orgSlug}/order`,
        icons: [{ src: logoUrl ?? '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Cash Drawer',
        short_name: 'Drawer',
        description: 'Open or close the cash drawer',
        url: `/${orgSlug}/drawer`,
        icons: [{ src: logoUrl ?? '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
