"use client";

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  ChevronDown,
  Clock,
  CreditCard,
  Crown,
  RefreshCw,
  ShieldAlert,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";

import { useSubscription } from "@/hooks/use-subscription";

const SUBSCRIBE_URL =
  process.env.NEXT_PUBLIC_SUBSCRIPTIONS_UI_URL || "https://pricing.codevertexitsolutions.com";

const UPGRADE_PATH = `${SUBSCRIBE_URL}/plans`;
const BILLING_PATH = `${SUBSCRIBE_URL}/billing`;

function formatDate(d: Date | null | string | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string | null }) {
  const config: Record<string, { label: string; classes: string }> = {
    active:    { label: "Active",    classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    trial:     { label: "Trial",     classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    past_due:  { label: "Past Due",  classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    suspended: { label: "Suspended", classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    expired:   { label: "Expired",   classes: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    cancelled: { label: "Cancelled", classes: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    none:      { label: "Free",      classes: "bg-muted text-muted-foreground" },
  };
  const c = config[status ?? "none"] ?? config.none;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.classes}`}>
      {c.label}
    </span>
  );
}

function UsageBar({ label, current, limit }: { label: string; current: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 0;
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground capitalize">{label.replace(/_/g, " ")}</span>
        <span className="font-medium">{current.toLocaleString()} / {limit.toLocaleString()}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Full-screen blocking overlay — shown when subscription is expired beyond grace period. */
function BlockingOverlay({ plan }: { plan: string }) {
  return (
    <div
      className="fixed inset-0 z-9999 flex flex-col items-center justify-center gap-6 bg-background/95 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-label="Subscription expired"
    >
      <div className="flex size-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
        <ShieldAlert className="size-8 text-red-600 dark:text-red-400" />
      </div>
      <div className="space-y-2 text-center max-w-md px-4">
        <h2 className="text-2xl font-bold">Subscription Expired</h2>
        <p className="text-sm text-muted-foreground">
          Your <span className="font-semibold">{plan}</span> plan has expired and the grace period has
          ended. Upgrade now to restore access.
        </p>
      </div>
      <a
        href={UPGRADE_PATH}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
      >
        <Zap className="size-4" />
        Upgrade now
      </a>
      <p className="text-xs text-muted-foreground">
        Contact <span className="font-medium">support@codevertexitsolutions.com</span> for assistance
      </p>
    </div>
  );
}

/**
 * Subscription banner — shown at the top of the main layout.
 *
 * State machine:
 * - Platform owner (codevertex): renders nothing
 * - Not hydrated: renders nothing (avoids flash)
 * - Expired beyond grace: full-screen blocking overlay
 * - In grace period: non-dismissable amber warning
 * - Suspended: non-dismissable amber warning
 * - Trial: blue countdown (dismissable)
 * - Active ≤ 7 days: amber renewing-soon (dismissable)
 * - Cancelled: red reactivate (dismissable)
 * - Active with expiry: compact expandable info bar
 * - No subscription: blue subscribe (dismissable)
 */
export function SubscriptionBanner() {
  const {
    isPlatformOwner,
    status,
    isPastDue,
    needsSubscription,
    isLoading,
    info,
    store,
  } = useSubscription();

  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (isPlatformOwner || isLoading || !info) return null;
  if (!store.hydrated) return null;

  const { gracePeriodEndsAt, isInGracePeriod, isExpired: storeExpired, daysUntilExpiry, expiresAt } = store;
  const normalizedPlan = (store.plan ?? info.planCode ?? "").toUpperCase() || "STARTER";
  const normalizedStatus = (status ?? "").toUpperCase();

  // Beyond grace — block the entire app
  if (storeExpired && !isInGracePeriod) {
    return <BlockingOverlay plan={normalizedPlan} />;
  }

  // In grace period — non-dismissable
  if (isInGracePeriod && gracePeriodEndsAt) {
    const daysLeft = Math.max(0, Math.ceil((gracePeriodEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    return (
      <div className="border-b bg-amber-50 border-amber-200 dark:bg-amber-950/50 dark:border-amber-800">
        <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center gap-3">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="flex-1 text-sm text-amber-800 dark:text-amber-200">
            Subscription expired —{" "}
            <span className="font-semibold">{daysLeft} day{daysLeft === 1 ? "" : "s"}</span>{" "}
            left to renew before access is blocked.
          </p>
          <a href={UPGRADE_PATH} target="_blank" rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 transition-colors">
            Renew now <ArrowRight className="size-3" />
          </a>
        </div>
      </div>
    );
  }

  if (dismissed) return null;

  // Suspended — non-dismissable
  if (normalizedStatus === "SUSPENDED") {
    return (
      <div className="border-b bg-amber-50 border-amber-200 dark:bg-amber-950/50 dark:border-amber-800">
        <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center gap-3">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="flex-1 text-sm text-amber-800 dark:text-amber-200">
            Your subscription is suspended. Please update your payment method to restore access.
          </p>
          <a href={BILLING_PATH} target="_blank" rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 transition-colors">
            Update payment <ArrowRight className="size-3" />
          </a>
        </div>
      </div>
    );
  }

  // Trial countdown
  if (normalizedStatus === "TRIAL" && expiresAt) {
    const days = daysUntilExpiry ?? 0;
    return (
      <div className="border-b bg-blue-50 border-blue-200 dark:bg-blue-950/50 dark:border-blue-800">
        <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center gap-3">
          <Clock className="size-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <p className="flex-1 text-sm text-blue-800 dark:text-blue-200">
            <span className="font-semibold">{normalizedPlan}</span> trial —{" "}
            <span className="font-semibold">{days} day{days === 1 ? "" : "s"}</span> left.
            Expires {formatDate(expiresAt)}. Upgrade to keep your features.
          </p>
          <a href={UPGRADE_PATH} target="_blank" rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors">
            Subscribe <ArrowRight className="size-3" />
          </a>
          <button onClick={() => setDismissed(true)} className="shrink-0 rounded p-1 opacity-60 hover:opacity-100 transition" aria-label="Dismiss">
            <X className="size-3.5 text-blue-700 dark:text-blue-300" />
          </button>
        </div>
      </div>
    );
  }

  // Active — expiring soon (≤ 7 days)
  if (normalizedStatus === "ACTIVE" && expiresAt && daysUntilExpiry !== null && daysUntilExpiry <= 7) {
    return (
      <div className="border-b bg-amber-50 border-amber-200 dark:bg-amber-950/50 dark:border-amber-800">
        <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center gap-3">
          <RefreshCw className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="flex-1 text-sm text-amber-800 dark:text-amber-200">
            <span className="font-semibold">{normalizedPlan}</span> plan — Renews in{" "}
            <span className="font-semibold">{daysUntilExpiry} day{daysUntilExpiry === 1 ? "" : "s"}</span>{" "}
            on {formatDate(expiresAt)}.
          </p>
          <a href={BILLING_PATH} target="_blank" rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 transition-colors">
            Manage billing <ArrowRight className="size-3" />
          </a>
          <button onClick={() => setDismissed(true)} className="shrink-0 rounded p-1 opacity-60 hover:opacity-100 transition" aria-label="Dismiss">
            <X className="size-3.5 text-amber-700 dark:text-amber-300" />
          </button>
        </div>
      </div>
    );
  }

  // Cancelled
  if (normalizedStatus === "CANCELLED") {
    return (
      <div className="border-b bg-red-50 border-red-200 dark:bg-red-950/50 dark:border-red-800">
        <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center gap-3">
          <AlertTriangle className="size-4 text-red-600 dark:text-red-400 shrink-0" />
          <p className="flex-1 text-sm text-red-800 dark:text-red-200">
            <span className="font-semibold">{normalizedPlan}</span> plan cancelled
            {expiresAt ? ` — access until ${formatDate(expiresAt)}` : ""}. Reactivate to keep access.
          </p>
          <a href={UPGRADE_PATH} target="_blank" rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 transition-colors">
            Reactivate <ArrowRight className="size-3" />
          </a>
          <button onClick={() => setDismissed(true)} className="shrink-0 rounded p-1 opacity-60 hover:opacity-100 transition" aria-label="Dismiss">
            <X className="size-3.5 text-red-700 dark:text-red-300" />
          </button>
        </div>
      </div>
    );
  }

  // Active with expiry — expandable details panel
  if (normalizedStatus === "ACTIVE" && expiresAt) {
    const usageEntries = Object.entries((info as any).usage ?? {}).filter(
      ([key]) => (info.limits)?.[key] !== undefined,
    ) as [string, number][];
    const price = (info as any).price as number | null;
    const currency = (info as any).currency as string ?? 'KES';
    const billingInterval = (info as any).billingInterval as string | null;
    const licenseCount = (info as any).licenseCount as number | null;

    const fmtPrice = (amount: number, cur: string) => {
      try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(amount); }
      catch { return `${cur} ${amount.toLocaleString()}`; }
    };

    return (
      <div className={`border-b ${isPastDue
        ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/50 dark:border-amber-800'
        : 'bg-background/60 border-border'}`}>
        <div className="mx-auto max-w-6xl px-4 py-2 flex items-center gap-3">
          <Crown className="size-4 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">{info.planName || normalizedPlan}</span>
          <StatusBadge status={status} />
          <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="size-3" /> Renews {formatDate(expiresAt)}
          </span>
          <div className="flex-1" />
          <a href={`${UPGRADE_PATH}?from=${info.planCode ?? ""}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 transition-colors">
            Upgrade <ArrowRight className="size-3" />
          </a>
          <button onClick={() => setExpanded(!expanded)} className="shrink-0 rounded p-1 opacity-60 hover:opacity-100 transition" aria-label={expanded ? "Collapse" : "Expand"}>
            <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          <button onClick={() => setDismissed(true)} className="shrink-0 rounded p-1 opacity-60 hover:opacity-100 transition" aria-label="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>

        {expanded && (
          <div className="mx-auto max-w-6xl border-t border-inherit px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-start gap-2">
                <Crown className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Plan</p>
                  <p className="text-sm font-medium">{info.planName || "—"}</p>
                  {info.planCode && <p className="text-xs text-muted-foreground">{info.planCode}</p>}
                </div>
              </div>
              {(price != null || billingInterval) && (
                <div className="flex items-start gap-2">
                  <CreditCard className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Billing</p>
                    <p className="text-sm font-medium">
                      {price != null ? fmtPrice(price, currency) : "—"}
                      {billingInterval && <span className="text-xs text-muted-foreground">/{billingInterval === "yearly" ? "yr" : "mo"}</span>}
                    </p>
                  </div>
                </div>
              )}
              {expiresAt && (
                <div className="flex items-start gap-2">
                  <Calendar className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Next Renewal</p>
                    <p className="text-sm font-medium">{formatDate(expiresAt)}</p>
                  </div>
                </div>
              )}
              {licenseCount != null && (
                <div className="flex items-start gap-2">
                  <Users className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Seats</p>
                    <p className="text-sm font-medium">{licenseCount}</p>
                  </div>
                </div>
              )}
            </div>

            {usageEntries.length > 0 && (
              <div className="mt-4 border-t border-inherit pt-4">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <BarChart3 className="size-3.5" /> Usage
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {usageEntries.map(([key, current]) => (
                    <UsageBar key={key} label={key} current={current} limit={info.limits[key]} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // No subscription
  if (needsSubscription) {
    return (
      <div className="border-b bg-blue-50 border-blue-200 dark:bg-blue-950/50 dark:border-blue-800">
        <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center gap-3">
          <Zap className="size-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <p className="flex-1 text-sm text-blue-800 dark:text-blue-200">
            No active subscription — subscribe to unlock all features.
          </p>
          <a href={UPGRADE_PATH} target="_blank" rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors">
            Subscribe <ArrowRight className="size-3" />
          </a>
          <button onClick={() => setDismissed(true)} className="shrink-0 rounded p-1 opacity-60 hover:opacity-100 transition" aria-label="Dismiss">
            <X className="size-3.5 text-blue-700 dark:text-blue-300" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}

/** Subscription gate overlay — wraps main content; shows blocking modal when expired beyond grace. */
export function SubscriptionExpiredOverlay({ children }: { children: React.ReactNode }) {
  const { status, isPastDue, isLoading, info, store } = useSubscription();

  if (isLoading || !store.hydrated) return <>{children}</>;

  const isHardBlocked = (store.isExpired && !store.isInGracePeriod) || status === "cancelled" || status === "suspended";
  if (!isHardBlocked) return <>{children}</>;

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none select-none blur-sm opacity-30">{children}</div>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="mx-4 max-w-md w-full bg-card rounded-2xl shadow-2xl p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <ShieldAlert className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">
            {status === "suspended" ? "Account Suspended" : "Subscription Ended"}
          </h2>
          {info?.planName && (
            <p className="text-sm text-muted-foreground mb-1">Plan: <span className="font-semibold">{info.planName}</span></p>
          )}
          <p className="text-muted-foreground mb-6 text-sm">
            {status === "suspended"
              ? "Your account has been suspended. All POS operations are paused until renewed."
              : isPastDue
              ? "Your payment is overdue. Please update your payment method to resume."
              : "Your subscription has expired and the grace period has ended."}
          </p>
          <a
            href={`${SUBSCRIBE_URL}/subscribe`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-6 py-3 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-colors w-full"
          >
            Renew Subscription
          </a>
          <p className="mt-4 text-xs text-muted-foreground">
            Contact <span className="font-medium">support@codevertexitsolutions.com</span>
          </p>
        </div>
      </div>
    </div>
  );
}
