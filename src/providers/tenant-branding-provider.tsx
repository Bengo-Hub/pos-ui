'use client';

import { getBrandFromMetadata, getTenantBySlug, type PublicTenant } from '@/lib/tenant-api';
import { useParams } from 'next/navigation';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

type TenantBrandingContextType = {
  tenant: PublicTenant | null;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  isLoading: boolean;
};

const TenantBrandingContext = createContext<TenantBrandingContextType | undefined>(undefined);

const DEFAULT_PRIMARY = '#0ea5e9';
const DEFAULT_SECONDARY = '#6366f1';

export function TenantBrandingProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const [tenant, setTenant] = useState<PublicTenant | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_SECONDARY);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!orgSlug) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    getTenantBySlug(orgSlug).then((t) => {
      if (cancelled) return;
      setTenant(t || null);
      if (t) {
        const brand = getBrandFromMetadata(t.metadata);
        setLogoUrl(brand.logoUrl);
        setPrimaryColor(brand.primaryColor);
        setSecondaryColor(brand.secondaryColor);
        document.documentElement.style.setProperty('--primary', brand.primaryColor);
        document.documentElement.style.setProperty('--tenant-primary', brand.primaryColor);
        document.documentElement.style.setProperty('--tenant-secondary', brand.secondaryColor);
        document.documentElement.style.setProperty('--tenant-logo-url', brand.logoUrl ? `url(${brand.logoUrl})` : 'none');
      }
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  const value: TenantBrandingContextType = {
    tenant,
    logoUrl,
    primaryColor,
    secondaryColor,
    isLoading,
  };

  return (
    <TenantBrandingContext.Provider value={value}>
      {children}
    </TenantBrandingContext.Provider>
  );
}

export function useTenantBranding() {
  const ctx = useContext(TenantBrandingContext);
  if (ctx === undefined) throw new Error('useTenantBranding must be used within TenantBrandingProvider');
  return ctx;
}
