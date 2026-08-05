import { getKV, setKV } from '@/lib/db/kv-cache';
import { useParams } from 'next/navigation';
import { ReactNode } from 'react';
import {
  TenantBrandingProvider as SharedTenantBrandingProvider,
  useTenantBranding as useSharedTenantBranding,
  type TenantCacheAdapter,
} from '@bengo-hub/shared-ui-lib/tenant';

/**
 * pos-ui's own Dexie-backed kvCache table already caches many OTHER datasets besides tenant
 * branding (POS settings, tenders, categories, outlet info, recent orders — see
 * `@/lib/db/kv-cache.ts`), so we inject it here instead of letting the shared module spin up
 * its own separate native-IndexedDB cache.
 */
const posKvCacheAdapter: TenantCacheAdapter = { getKV, setKV };

const AUTH_API_BASE =
  process.env.NEXT_PUBLIC_SSO_URL || process.env.NEXT_PUBLIC_AUTH_API_URL || 'https://sso.codevertexafrica.com';

/** pos-ui's own default brand color (was the previous hardcoded "Codevertex Africa Limited" fallback's palette — kept only as a neutral color default, never as a claimed tenant identity). */
const DEFAULT_PRIMARY_COLOR = '#ea8022';
const DEFAULT_SECONDARY_COLOR = '#ae6221';

export function TenantBrandingProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const slug = (params?.orgSlug as string) || '';

  return (
    <SharedTenantBrandingProvider
      slug={slug}
      authApiBase={AUTH_API_BASE}
      cache={posKvCacheAdapter}
      defaultPrimaryColor={DEFAULT_PRIMARY_COLOR}
      defaultSecondaryColor={DEFAULT_SECONDARY_COLOR}
    >
      {children}
    </SharedTenantBrandingProvider>
  );
}

export const useTenantBranding = useSharedTenantBranding;
