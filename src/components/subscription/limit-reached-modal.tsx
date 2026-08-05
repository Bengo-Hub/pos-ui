"use client";

import { useState } from "react";
import { Gauge, Zap } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { useLimitModal } from "@/store/limit-modal";
import { useSubscription } from "@/hooks/use-subscription";
import { useAuthStore } from "@/store/auth";
import { usePOSSettings } from "@/hooks/usePOSSettings";
import { setOverageEnabled } from "@/lib/auth/subscription";
import { formatCurrency } from "@/lib/utils";

const SUBSCRIBE_URL =
  process.env.NEXT_PUBLIC_SUBSCRIPTIONS_UI_URL || "https://pricing.codevertexafrica.com";

const prettyMetric = (m: string) =>
  m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Global limit-reached modal. Mounted once near the app root; opened imperatively via
 * useLimitModal when a mutation returns 402. When the hit metric supports overage it
 * offers an "Enable extra usage" switch that opts the tenant in (pay next cycle) and
 * retries the original action; otherwise it routes to upgrade.
 */
export function LimitReachedModal() {
  const { open, info, onRetry, close } = useLimitModal();
  const { isPlatformOwner, isDemo, isServiceCharge } = useSubscription();
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id as string | undefined;
  const [enabling, setEnabling] = useState(false);
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const fmtKes = (n: number) => formatCurrency(n, currency);

  // Exempt users never see this modal (they never receive a 402 either; belt-and-suspenders).
  if (isPlatformOwner || isDemo || isServiceCharge || !info) return null;

  const canOverage = info.overageEligible && info.overageUnitPrice > 0;

  const handleEnable = async () => {
    if (!tenantId) return;
    setEnabling(true);
    const ok = await setOverageEnabled(tenantId, true);
    setEnabling(false);
    if (ok) {
      toast.success("Extra usage enabled", {
        description: "You can continue working. Overage will be billed on your next renewal.",
      });
      close();
      onRetry?.();
    } else {
      toast.error("Could not enable extra usage", { description: "Please try again or contact support." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? close() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-amber-500/15">
            <Gauge className="size-5 text-amber-500" />
          </div>
          <DialogTitle>{prettyMetric(info.metric)} limit reached</DialogTitle>
          <DialogDescription>
            Your plan allows <span className="font-semibold">{info.limit.toLocaleString()}</span>{" "}
            {prettyMetric(info.metric).toLowerCase()} this period and you&apos;ve used{" "}
            <span className="font-semibold">{info.used.toLocaleString()}</span>.
          </DialogDescription>
        </DialogHeader>

        {canOverage ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Extra usage price</span>
              <span className="font-semibold">
                {fmtKes(info.overageUnitPrice)}{info.overageUnit ? ` ${info.overageUnit}` : ""}
              </span>
            </div>
            {info.accruedOverageKes > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Accrued this period</span>
                <span className="font-semibold">{fmtKes(info.accruedOverageKes)}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Enable extra usage to keep working now. The overage is added to your next renewal
              invoice; you can turn it off any time in Settings → Subscription.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This limit can&apos;t be extended with pay-as-you-go usage. Upgrade your plan to raise it.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={close}>
            Not now
          </Button>
          {canOverage ? (
            <Button onClick={handleEnable} disabled={enabling}>
              <Zap className="mr-1.5 size-4" />
              {enabling ? "Enabling…" : "Enable extra usage"}
            </Button>
          ) : (
            <a
              href={info.upgradeUrl || `${SUBSCRIBE_URL}/subscribe`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "default" })}
            >
              <Zap className="mr-1.5 size-4" />
              Upgrade plan
            </a>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
