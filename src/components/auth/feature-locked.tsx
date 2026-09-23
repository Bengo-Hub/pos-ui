'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useFeatureUpgrade } from '@bengo-hub/shared-ui-lib/subscription';

interface FeatureLockedProps {
  /** Subscription feature code, e.g. "hotel_module" — same code used in nav-config.ts subFeature */
  feature: string;
  /** Friendly name for the copy, e.g. "Hotel & Rooms" */
  label: string;
}

/**
 * Full-page locked state for a subscription-gated module/page — pair with shared-ui-lib's
 * <FeatureGate feature="x" fallback={<FeatureLocked feature="x" label="..." />}> so the guarded
 * page's own data queries never mount when the tenant's plan doesn't include the feature. That
 * matters beyond styling: letting the page render and fetch anyway is what surfaced a global
 * "Subscription limit reached" toast on every visit (and on the dashboard, on every page LOAD,
 * since HospitalityDashboard's occupancy report auto-fetches) — this replaces that with the same
 * calm, in-context "upgrade" affordance the sidebar's lock badge already gives, per fleet
 * convention (mirrors projects-ui's FeatureLocked component).
 */
export function FeatureLocked({ feature, label }: FeatureLockedProps) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { tierLabel, upgradeHref } = useFeatureUpgrade(feature);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="h-16 w-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
        <Lock className="h-7 w-7 text-amber-600" />
      </div>
      <h2 className="text-lg font-bold text-foreground font-display mb-1">Upgrade Required</h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        <span className="font-semibold">{label}</span> needs {tierLabel === 'a higher plan' ? tierLabel : `the ${tierLabel} plan`}.
        Upgrade to unlock it for this outlet.
      </p>
      <div className="flex items-center gap-2">
        <a
          href={upgradeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Lock className="h-4 w-4" />
          Upgrade Plan
        </a>
        <Link
          href={`/${orgSlug}/dashboard`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
