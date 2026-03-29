"use client";

import { Lock, Zap } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { useSubscription } from "@/hooks/use-subscription";

const SUBSCRIBE_URL =
  process.env.NEXT_PUBLIC_SUBSCRIPTIONS_UI_URL || "https://pricing.codevertexitsolutions.com";

interface SubscriptionGateProps {
  feature?: string;
  plan?: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Wraps content that requires a specific subscription feature or plan.
 * Shows an upgrade prompt instead of the content when the feature is not available.
 * Never blocks rendering during loading — shows children optimistically.
 */
export function SubscriptionGate({
  feature,
  plan: _plan,
  children,
  fallback,
}: SubscriptionGateProps) {
  const { isActive, hasFeature, isLoading } = useSubscription();

  if (isLoading || isActive) {
    if (feature && !isLoading && !hasFeature(feature)) {
      return <>{fallback ?? <DefaultUpgradePrompt feature={feature} />}</>;
    }
    return <>{children}</>;
  }

  return <>{fallback ?? <DefaultUpgradePrompt feature={feature ?? null} />}</>;
}

function DefaultUpgradePrompt({ feature }: { feature: string | null }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
        <Lock className="size-5 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">
          {feature ? "Feature requires upgrade" : "Premium feature"}
        </p>
        <p className="text-xs text-muted-foreground">
          Upgrade your plan to access this feature and more.
        </p>
      </div>
      <Link
        href={`${SUBSCRIBE_URL}/subscribe`}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Zap className="size-3.5" />
        Upgrade plan
      </Link>
    </div>
  );
}
