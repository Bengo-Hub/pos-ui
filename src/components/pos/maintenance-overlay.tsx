'use client';

import { useAuthStore } from '@/store/auth';
import { useMaintenanceStore } from '@/store/maintenance';
import { LogIn, Mail, ShieldAlert } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';

/**
 * Full-screen, non-dismissable block shown the instant any request comes back
 * tenant_under_repair (pos-api's maintenance-window gate — product name: Repair Mode) or the
 * PIN-login screen gets the same code directly from the login endpoint. z-[100] — deliberately
 * higher than every other modal/dialog in this app (z-50) so a maintenance window always wins
 * even over something already open (a payment modal, an approval dialog, etc). There is no close
 * action anywhere on this — by design, only the window elapsing or a platform owner cancelling it
 * clears the block; the store itself has no "dismiss".
 */
export function MaintenanceOverlay() {
  const router = useRouter();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const active = useMaintenanceStore((s) => s.active);
  const tenantId = useMaintenanceStore((s) => s.tenantId);
  const reason = useMaintenanceStore((s) => s.reason);
  const endsAt = useMaintenanceStore((s) => s.endsAt);
  const currentTenantId = useAuthStore((s) => s.user?.tenant_id);
  const clearMaintenance = useMaintenanceStore((s) => s.clear);

  if (!active || !tenantId || tenantId !== currentTenantId) return null;

  const endsAtLabel = endsAt
    ? new Date(endsAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-auto flex w-full max-w-lg flex-col items-center gap-5 rounded-3xl border border-border bg-card p-6 text-center shadow-2xl sm:gap-6 sm:p-10">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-destructive/10 sm:h-24 sm:w-24">
          <ShieldAlert className="h-10 w-10 text-destructive sm:h-12 sm:w-12" />
        </div>
        <div className="max-w-md">
          <h2 className="text-2xl font-black text-foreground sm:text-3xl">Under Maintenance</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
            {reason || 'This system is temporarily under maintenance. Please try again later.'}
          </p>
        </div>
        {endsAtLabel && (
          <p className="text-sm text-muted-foreground">
            Expected back at <span className="font-semibold text-foreground">{endsAtLabel}</span>
          </p>
        )}
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              clearMaintenance();
              router.replace(`/${orgSlug}/pin-login`);
            }}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <LogIn className="h-4 w-4" />
            Back to login
          </button>
          <a
            href="mailto:info@codevertexafrica.com?subject=POS%20maintenance%20support"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <Mail className="h-4 w-4" />
            Contact support
          </a>
        </div>
      </div>
    </div>
  );
}
