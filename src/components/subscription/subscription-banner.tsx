"use client";

import { AlertTriangle, ArrowRight, Clock, X, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useSubscription } from "@/hooks/use-subscription";

const SUBSCRIBE_URL =
  process.env.NEXT_PUBLIC_SUBSCRIPTIONS_UI_URL || "https://pricing.codevertexitsolutions.com";

/**
 * Persistent banner shown at the top of the layout for degraded subscription states.
 * Renders nothing for active/trial (with time remaining) subscriptions.
 * Never blocks access — just informs and encourages upgrade.
 */
export function SubscriptionBanner() {
  const { status, isActive, isPastDue, isExpired, needsSubscription, isLoading, info } =
    useSubscription();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || isLoading || isActive) return null;

  if (status === "trial" && info?.trialEndsAt) {
    const daysLeft = Math.ceil(
      (new Date(info.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (daysLeft > 3) return null;

    return (
      <Banner
        variant="warning"
        icon={<Clock className="size-4" />}
        message={`Your free trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Subscribe to keep your features.`}
        actionLabel="Subscribe now"
        actionHref={`${SUBSCRIBE_URL}/subscribe`}
        onDismiss={() => setDismissed(true)}
      />
    );
  }

  if (isPastDue) {
    return (
      <Banner
        variant="warning"
        icon={<AlertTriangle className="size-4" />}
        message="Your payment is past due. Please update your payment method to avoid service interruption."
        actionLabel="Update payment"
        actionHref={`${SUBSCRIBE_URL}/billing`}
        onDismiss={() => setDismissed(true)}
      />
    );
  }

  if (isExpired) {
    return (
      <Banner
        variant="error"
        icon={<AlertTriangle className="size-4" />}
        message="Your subscription has expired. Upgrade to continue using premium features."
        actionLabel="Reactivate"
        actionHref={`${SUBSCRIBE_URL}/subscribe`}
        onDismiss={() => setDismissed(true)}
      />
    );
  }

  if (needsSubscription) {
    return (
      <Banner
        variant="info"
        icon={<Zap className="size-4" />}
        message="You're on the free tier. Upgrade to unlock premium features like delivery tracking, loyalty programs, and more."
        actionLabel="See plans"
        actionHref={`${SUBSCRIBE_URL}/subscribe`}
        onDismiss={() => setDismissed(true)}
      />
    );
  }

  return null;
}

function Banner({
  variant,
  icon,
  message,
  actionLabel,
  actionHref,
  onDismiss,
}: {
  variant: "info" | "warning" | "error";
  icon: React.ReactNode;
  message: string;
  actionLabel: string;
  actionHref: string;
  onDismiss: () => void;
}) {
  const colors = {
    info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200",
    warning: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200",
    error: "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200",
  };

  return (
    <div className={`border-b px-4 py-2.5 ${colors[variant]}`}>
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        {icon}
        <p className="flex-1 text-sm">{message}</p>
        <Link
          href={actionHref}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-current/20 bg-transparent px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {actionLabel}
          <ArrowRight className="size-3" />
        </Link>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded p-1 opacity-60 transition hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
