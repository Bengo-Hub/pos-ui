import { type NextRequest, NextResponse } from 'next/server';

const AUTH_API_BASE =
  process.env.NEXT_PUBLIC_SSO_URL ||
  process.env.NEXT_PUBLIC_AUTH_API_URL ||
  'https://sso.codevertexafrica.com';

const DEFAULT_PRIMARY = '#ea8022';
const DEFAULT_BG = '#1c0f02';
// This app's entry in tenant metadata service_branding (set in Accounts > Branding).
const SERVICE_KEY = 'pos';

interface ServiceBrandingEntry {
  name?: string;
  short_name?: string;
  tagline?: string;
  theme_color?: string;
  icon_url?: string;
}

interface TenantResponse {
  name?: string;
  slug?: string;
  logo_url?: string;
  brand_colors?: { primary?: string; secondary?: string };
  metadata?: Record<string, unknown>;
}

async function fetchTenant(slug: string): Promise<TenantResponse | null> {
  try {
    const res = await fetch(
      `${AUTH_API_BASE}/api/v1/tenants/by-slug/${encodeURIComponent(slug)}`,
      { next: { revalidate: 600 } },
    );
    if (!res.ok) return null;
    return res.json() as Promise<TenantResponse>;
  } catch {
    return null;
  }
}

function serviceEntry(metadata: Record<string, unknown> | undefined): ServiceBrandingEntry {
  const all = metadata?.service_branding;
  if (!all || typeof all !== 'object') return {};
  const entry = (all as Record<string, unknown>)[SERVICE_KEY];
  return entry && typeof entry === 'object' ? (entry as ServiceBrandingEntry) : {};
}

function metaString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = metadata?.[key];
  return typeof v === 'string' && v ? v : undefined;
}

/** Declared type of an icon URL; a wrong type makes browsers skip the icon. */
function iconMime(url: string): string | undefined {
  const data = /^data:(image\/[a-z0-9.+-]+)/i.exec(url);
  if (data) return data[1];
  const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return undefined;
}

// Bundled square PNGs are always listed so the app stays installable when the
// tenant icon is a wide logo; the tenant icon comes first so browsers prefer it.
const BUNDLED_ICONS = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const tenant = await fetchTenant(orgSlug);
  const entry = serviceEntry(tenant?.metadata);

  // Neutral fallback: the tenant's own slug, never a specific business's identity.
  const businessName = tenant?.name ?? orgSlug;
  const firstWord = businessName.trim().split(/\s+/)[0] || 'Bengo';
  // Tenant's own app name (e.g. "Loft Till"), else "<Business> POS". The home
  // screen label defaults to "<First word> POS" so a tenant's several
  // installed apps stay distinguishable.
  const name = entry.name || `${businessName} POS`;
  const shortName = entry.short_name || (entry.name && entry.name.length <= 12 ? entry.name : `${firstWord} POS`);
  const primaryColor =
    entry.theme_color ?? tenant?.brand_colors?.primary ?? metaString(tenant?.metadata, 'primary_color') ?? DEFAULT_PRIMARY;
  const bgColor =
    tenant?.brand_colors?.secondary ?? metaString(tenant?.metadata, 'secondary_color') ?? DEFAULT_BG;
  const iconUrl = entry.icon_url || tenant?.logo_url || metaString(tenant?.metadata, 'logo_url');
  const iconType = iconUrl ? iconMime(iconUrl) : undefined;

  const icons = [
    ...(iconUrl
      ? [{ src: iconUrl, sizes: iconType === 'image/svg+xml' ? 'any' : '512x512', ...(iconType ? { type: iconType } : {}), purpose: 'any' }]
      : []),
    ...BUNDLED_ICONS,
  ];
  const shortcutIcons = [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }];

  const manifest = {
    id: `/${orgSlug}/`,
    name,
    short_name: shortName,
    description: entry.tagline || 'Fast, offline-ready Point of Sale for your business.',
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
        icons: shortcutIcons,
      },
      {
        name: 'Cash Drawer',
        short_name: 'Drawer',
        description: 'Open or close the cash drawer',
        url: `/${orgSlug}/drawer`,
        icons: shortcutIcons,
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=600, stale-while-revalidate=86400',
    },
  });
}
