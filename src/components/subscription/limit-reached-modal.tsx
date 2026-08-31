"use client";

import { toast } from "sonner";
import { LimitReachedModal as SharedLimitReachedModal } from "@bengo-hub/shared-ui-lib/subscription";

import { useLimitModal } from "@/store/limit-modal";
import { useSubscription } from "@/hooks/use-subscription";
import { useAuthStore } from "@/store/auth";
import { usePOSSettings } from "@/hooks/usePOSSettings";
import { setOverageEnabled } from "@/lib/auth/subscription";
import { formatCurrency } from "@/lib/utils";

const SUBSCRIBE_URL =
  process.env.NEXT_PUBLIC_SUBSCRIPTIONS_UI_URL || "https://pricing.codevertexafrica.com";

/**
 * Global limit-reached modal. Mounted once near the app root; opened imperatively via
 * useLimitModal when a mutation returns 402. Renders the shared LimitReachedModal
 * (@bengo-hub/shared-ui-lib/subscription) with pos-specific wiring: overage enrollment
 * (pos is the only app with overage-eligible metered limits — orders/transactions) and
 * tenant-currency formatting.
 */
export function LimitReachedModal() {
  const { open, info, onRetry, close } = useLimitModal();
  const { isPlatformOwner, isDemo, isServiceCharge } = useSubscription();
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id as string | undefined;
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? "KES";

  // Exempt users never see this modal (they never receive a 402 either; belt-and-suspenders).
  if (isPlatformOwner || isDemo || isServiceCharge) return null;

  const handleEnableOverage = tenantId
    ? async () => {
        const ok = await setOverageEnabled(tenantId, true);
        if (ok) {
          toast.success("Extra usage enabled", {
            description: "You can continue working. Overage will be billed on your next renewal.",
          });
        } else {
          toast.error("Could not enable extra usage", {
            description: "Please try again or contact support.",
          });
        }
        return ok;
      }
    : undefined;

  return (
    <SharedLimitReachedModal
      open={open}
      info={info}
      onClose={close}
      onRetry={onRetry ?? undefined}
      subscribeUrl={SUBSCRIBE_URL}
      formatCurrency={(n) => formatCurrency(n, currency)}
      onEnableOverage={handleEnableOverage}
    />
  );
}
