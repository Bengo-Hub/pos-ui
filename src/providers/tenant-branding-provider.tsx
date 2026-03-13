import { fetchTenantBySlug, type TenantBrand } from '@/lib/tenant-api';
import { useParams } from 'next/navigation';
import { createContext, ReactNode, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

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
  logoUrl: '/images/logo/codevertex.png',
  primaryColor: '#5B1C4D',
  secondaryColor: '#ea8022',
  orgName: 'Codevertex IT Solutions',
};

export function TenantBrandingProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const slug = (params?.orgSlug as string) || '';

  const { data: tenant, isLoading, error } = useQuery({
    queryKey: ['tenant', slug],
    queryFn: () => fetchTenantBySlug(slug),
    staleTime: 1000 * 60 * 10,
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
      
      document.documentElement.style.setProperty('--tenant-primary', primary);
      document.documentElement.style.setProperty('--tenant-secondary', secondary);
      document.documentElement.style.setProperty('--tenant-logo-url', `url(${logo})`);
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
