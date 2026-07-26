'use client';

/**
 * Bridges pos-ui's useSubscription hook + the platform feature catalog into the shared
 * SubscriptionProvider, so shared <FeatureLock>/<UpgradeDialog> render "Upgrade to <tier>" and
 * deep-link to the pricing page without any hardcoded per-app feature→tier map.
 */

import { ReactNode, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SubscriptionProvider, type FeatureCatalogEntry } from '@bengo-hub/shared-ui-lib/subscription';
import { useSubscription } from '@/hooks/use-subscription';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';

const UPGRADE_BASE = process.env.NEXT_PUBLIC_SUBSCRIPTIONS_UI_URL || 'https://pricing.codevertexafrica.com';

interface CatalogItem {
  featureCode: string;
  label?: string;
  serviceTag?: string;
  minPlanCode?: string;
  minTierLabel?: string;
  minTierOrder?: number;
}

export function SubscriptionEntitlementsProvider({ children }: { children: ReactNode }) {
  const sub = useSubscription();
  const isExempt = sub.isPlatformOwner || sub.isDemo || sub.isServiceCharge;
  const tenantSlug = useAuthStore((s) => (s.user?.tenant_slug as string | undefined) ?? '');
  const offlineCatalog = useSubscriptionStore((s) => s.catalog);
  const setCatalog = useSubscriptionStore((s) => s.setCatalog);

  // The catalog (minPlanCode/minTierLabel/minTierOrder per feature) is static-ish → fetch once, long cache.
  const { data: catalogData } = useQuery({
    queryKey: ['features-catalog'],
    queryFn: async () => {
      const res = await fetch('/api/features-catalog');
      if (!res.ok) return { features: [] as CatalogItem[] };
      return (await res.json()) as { features: CatalogItem[] };
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const fetchedCatalog = useMemo<Record<string, FeatureCatalogEntry>>(() => {
    const map: Record<string, FeatureCatalogEntry> = {};
    for (const f of catalogData?.features ?? []) {
      map[f.featureCode] = {
        minPlanCode: f.minPlanCode,
        minTierLabel: f.minTierLabel,
        minTierOrder: f.minTierOrder,
        serviceTag: f.serviceTag,
        label: f.label,
      };
    }
    return map;
  }, [catalogData]);

  // Persist the fetched catalog to IndexedDB so the tier-aware wrapper resolves identically offline.
  useEffect(() => {
    if (Object.keys(fetchedCatalog).length && tenantSlug) setCatalog(fetchedCatalog, tenantSlug);
  }, [fetchedCatalog, tenantSlug, setCatalog]);

  // Prefer the freshly-fetched catalog; fall back to the offline-cached one when the fetch is empty.
  const catalog = useMemo<Record<string, FeatureCatalogEntry>>(
    () => (Object.keys(fetchedCatalog).length ? fetchedCatalog : (offlineCatalog ?? {})),
    [fetchedCatalog, offlineCatalog],
  );

  const value = useMemo(
    () => ({
      features: sub.info?.features ?? [],
      limits: (sub.info?.limits as Record<string, number>) ?? {},
      isExempt,
      status: sub.status,
      isLoading: sub.isLoading,
      planCode: sub.plan,
      tierOrder: sub.tierOrder,
      catalog,
      upgradeBaseUrl: UPGRADE_BASE,
    }),
    [sub.info?.features, sub.info?.limits, isExempt, sub.status, sub.isLoading, sub.plan, sub.tierOrder, catalog],
  );

  return <SubscriptionProvider value={value}>{children}</SubscriptionProvider>;
}
