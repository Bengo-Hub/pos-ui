import { fetchTenantBySlug, type TenantBrand } from '@/lib/tenant-api';
import { useParams } from 'next/navigation';
import { createContext, ReactNode, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

function hexToRgbTriplet(hex: string): string {
  const t = hex.replace(/^#/, '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(t)) return '107 42 27';
  return `${parseInt(t.slice(0, 2), 16)} ${parseInt(t.slice(2, 4), 16)} ${parseInt(t.slice(4, 6), 16)}`;
}

function hexToHslTriplet(hex: string): string {
  const t = hex.replace(/^#/, '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(t)) return '24 91% 50%';
  const r = parseInt(t.slice(0, 2), 16) / 255;
  const g = parseInt(t.slice(2, 4), 16) / 255;
  const b = parseInt(t.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

type TenantBrandingContextType = {
  slug: string;
  tenant: TenantBrand | null;
  isLoading: boolean;
  error: Error | null;
  getServiceTitle: (appName: string) => string;
};

const TenantBrandingContext = createContext<TenantBrandingContextType | undefined>(undefined);

const DEFAULT_BRAND: TenantBrand = {
  id: 'platform',
  name: 'Codevertex',
  slug: 'codevertex',
  logoUrl: '/logo.jpeg',
  primaryColor: '#ea8022',
  secondaryColor: '#ae6221',
  orgName: 'Codevertex IT Solutions',
  useCase: 'other',
};

export function TenantBrandingProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const slug = (params?.orgSlug as string) || '';

  const { data: tenant, isLoading, error } = useQuery({
    queryKey: ['tenant', slug],
    queryFn: () => fetchTenantBySlug(slug),
    staleTime: 6 * 60 * 60 * 1000, // 6 hours — aligned with JWT TTL
    enabled: !!slug,
  });

  const effectiveBrand = useMemo(() => {
    if (tenant) return tenant;
    if (!isLoading && !tenant && slug) {
      return { ...DEFAULT_BRAND, slug, name: slug, orgName: slug };
    }
    return DEFAULT_BRAND;
  }, [tenant, isLoading, slug]);

  useMemo(() => {
    if (typeof window !== 'undefined') {
      const primary = effectiveBrand?.primaryColor || DEFAULT_BRAND.primaryColor!;
      const secondary = effectiveBrand?.secondaryColor || DEFAULT_BRAND.secondaryColor!;
      const logo = effectiveBrand?.logoUrl || DEFAULT_BRAND.logoUrl!;
      const root = document.documentElement;

      root.style.setProperty('--tenant-primary', primary);
      root.style.setProperty('--tenant-secondary', secondary);
      root.style.setProperty('--tenant-logo-url', `url(${logo})`);
      // Drive Tailwind semantic tokens from tenant brand color
      root.style.setProperty('--primary', hexToHslTriplet(primary));
      root.style.setProperty('--ring', hexToHslTriplet(primary));
      // Drive brand RGB triplets for bg-brand-primary / bg-brand-emphasis
      root.style.setProperty('--brand-primary', hexToRgbTriplet(primary));
      root.style.setProperty('--brand-emphasis', hexToRgbTriplet(secondary));
    }
  }, [effectiveBrand]);

  const getServiceTitle = (appName: string) => {
    const tenantName = effectiveBrand?.orgName || effectiveBrand?.name || '';
    const firstWord = tenantName.split(' ')[0] || 'Codevertex';
    return `${firstWord} ${appName}`;
  };

  const value = useMemo(
    () => ({
      slug,
      tenant: effectiveBrand,
      isLoading,
      error: error as Error | null,
      getServiceTitle,
    }),
    [slug, effectiveBrand, isLoading, error]
  );

  return (
    <TenantBrandingContext.Provider value={value}>
      {children}
    </TenantBrandingContext.Provider>
  );
}

export function useTenantBranding() {
  const context = useContext(TenantBrandingContext);
  if (!context) {
    return {
      slug: '',
      tenant: null,
      isLoading: false,
      error: null,
      getServiceTitle: (s: string) => s,
    };
  }
  return context;
}
