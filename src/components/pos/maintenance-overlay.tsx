'use client';

import { useMaintenanceStore } from '@/store/maintenance';
import { ShieldAlert } from 'lucide-react';

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
  const active = useMaintenanceStore((s) => s.active);
  const reason = useMaintenanceStore((s) => s.reason);
  const endsAt = useMaintenanceStore((s) => s.endsAt);

  if (!active) return null;

  const endsAtLabel = endsAt
    ? new Date(endsAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card shadow-2xl p-8 flex flex-col items-center gap-4 text-center">
        <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h2 className="text-xl font-black text-foreground">Under Maintenance</h2>
          <p className="text-sm text-muted-foreground mt-2">
            {reason || 'This system is temporarily under maintenance. Please try again later.'}
          </p>
        </div>
        {endsAtLabel && (
          <p className="text-xs text-muted-foreground">
            Expected back at <span className="font-semibold text-foreground">{endsAtLabel}</span>
          </p>
        )}
      </div>
    </div>
  );
}
