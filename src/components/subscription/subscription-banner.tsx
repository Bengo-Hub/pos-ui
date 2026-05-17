"use client";

import { AlertTriangle, ArrowRight, Clock, Monitor, ShieldAlert, X, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useSubscription } from "@/hooks/use-subscription";

const SUBSCRIBE_URL =
  process.env.NEXT_PUBLIC_SUBSCRIPTIONS_UI_URL || "https://pricing.codevertexitsolutions.com";

function fmtDate(iso?: string): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return null;
  }
}

function statusBadge(status: string | null): { label: string; className: string } {
  switch ((status ?? "").toLowerCase()) {
    case "active":
      return { label: "Active", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" };
    case "trial":
      return { label: "Trial", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" };
    case "expired":
    case "cancelled":
      return { label: status === "cancelled" ? "Cancelled" : "Expired", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" };
    case "past_due":
    case "suspended":
      return { label: status === "suspended" ? "Suspended" : "Past Due", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
    default:
      return { label: "No Plan", className: "bg-muted text-muted-foreground" };
  }
}

export function SubscriptionBanner() {
  const { status, isActive, isPastDue, isExpired, needsSubscription, isLoading, info, getLimit } =
    useSubscription();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || isLoading) return null;

  const badge = statusBadge(status);
  const expiryDate = fmtDate(info?.currentPeriodEnd);
  const maxDevices = getLimit("max_devices");
  const planName = info?.planName ?? info?.planCode ?? null;

  if (isActive) {
    const daysLeft = info?.currentPeriodEnd
      ? Math.ceil((new Date(info.currentPeriodEnd).getTime() - Date.now()) / 86400000)
      : null;

    if (status === "trial" && daysLeft !== null && daysLeft <= 3) {
      return (
        <Banner
          variant="warning"
          icon={<Clock className="size-4" />}
          message={`Free trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Subscribe to keep your features.`}
          meta={planName ? `Plan: ${planName}` : undefined}
          actionLabel="Subscribe now"
          actionHref={`${SUBSCRIBE_URL}/subscribe`}
          onDismiss={() => setDismissed(true)}
        />
      );
    }

    if (status === "trial") {
      return (
        <Banner
          variant="info"
          icon={<Clock className="size-4" />}
          message={`You are on a free trial${daysLeft !== null ? ` — ${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining` : ""}.`}
          meta={
            <span className="flex items-center gap-2">
              {planName && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>}
              {expiryDate && <span className="text-xs">Expires {expiryDate}</span>}
              {maxDevices !== Infinity && maxDevices > 0 && (
                <span className="flex items-center gap-1 text-xs"><Monitor className="size-3" />{maxDevices} device{maxDevices === 1 ? "" : "s"}</span>
              )}
            </span>
          }
          actionLabel="Upgrade"
          actionHref={`${SUBSCRIBE_URL}/subscribe`}
          onDismiss={() => setDismissed(true)}
        />
      );
    }

    return null;
  }

  if (isPastDue) {
    return (
      <Banner
        variant="warning"
        icon={<AlertTriangle className="size-4" />}
        message="Your payment is past due. Please update your payment method to avoid service interruption."
        meta={
          <span className="flex items-center gap-2">
            {planName && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>}
            {maxDevices !== Infinity && maxDevices > 0 && (
              <span className="flex items-center gap-1 text-xs"><Monitor className="size-3" />{maxDevices} device{maxDevices === 1 ? "" : "s"}</span>
            )}
          </span>
        }
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
        meta={
          <span className="flex items-center gap-2">
            {planName && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>}
            {expiryDate && <span className="text-xs">Expired {expiryDate}</span>}
          </span>
        }
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
        message="You are on the free tier. Upgrade to unlock premium features like shift reports, table management, and more."
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
  meta,
  actionLabel,
  actionHref,
  onDismiss,
}: {
  variant: "info" | "warning" | "error";
  icon: React.ReactNode;
  message: string;
  meta?: React.ReactNode;
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
        <div className="flex-1 min-w-0">
          <p className="text-sm">{message}</p>
          {meta && <div className="mt-0.5 flex items-center gap-2 flex-wrap">{meta}</div>}
        </div>
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

const GRACE_PERIOD_DAYS = 7;

export function SubscriptionExpiredOverlay({ children }: { children: React.ReactNode }) {
  const { status, isExpired, isPastDue, isLoading, info } = useSubscription();

  if (isLoading) return <>{children}</>;

  const expiredBeyondGrace = (() => {
    if (!isExpired) return false;
    if (!info?.currentPeriodEnd) return true;
    const graceDeadline = new Date(info.currentPeriodEnd).getTime() + GRACE_PERIOD_DAYS * 86400000;
    return Date.now() > graceDeadline;
  })();

  const isHardBlocked = expiredBeyondGrace || status === "cancelled" || status === "suspended";

  if (!isHardBlocked) return <>{children}</>;

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none select-none blur-sm opacity-30">
        {children}
      </div>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="mx-4 max-w-md w-full bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <ShieldAlert className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {status === "suspended" ? "Account Suspended" : "Subscription Ended"}
          </h2>
          {info?.planName && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              Plan: <span className="font-semibold">{info.planName}</span>
            </p>
          )}
          <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">
            {status === "suspended"
              ? "Your account has been suspended. All POS operations are paused until your subscription is renewed."
              : isPastDue
              ? "Your payment is overdue. Please update your payment method to resume operations."
              : "Your subscription has expired and the grace period has ended. Renew to continue."}
          </p>
          <Link
            href={`${SUBSCRIBE_URL}/subscribe`}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700 transition-colors w-full"
          >
            Renew Subscription
          </Link>
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-500">
            Contact support@codevertexitsolutions.com for assistance
          </p>
        </div>
      </div>
    </div>
  );
}
