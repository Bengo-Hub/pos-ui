'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { maintenanceWindowApi } from '@/lib/api/maintenance-window';
import { usePlatformTenants } from '@/hooks/use-platform-tenants';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/** Converts a datetime-local input value (local time, no timezone) to an RFC3339 UTC string. */
function localInputToRFC3339(value: string): string {
  return new Date(value).toISOString();
}

/** Converts an RFC3339 string to a value a datetime-local input accepts, in local time. */
function rfc3339ToLocalInput(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Maintenance Window — platform-owner tool to schedule/cancel a tenant's repair-mode lockout.
 * Fleet-wide (any tenant, not just the one currently viewed), mirroring TxnReversalTab's own
 * tenant picker. The actual gate lives server-side (pos-api's maintenance-window handler +
 * middleware) — this UI only reads/writes the window, it never enforces anything itself.
 */
export function MaintenanceWindowTab() {
  const { data: tenants = [] } = usePlatformTenants();
  const [tenantId, setTenantId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const qc = useQueryClient();

  const selectedTenant = useMemo(() => tenants.find((t) => t.id === tenantId), [tenants, tenantId]);

  const { data: current, isFetching } = useQuery({
    queryKey: ['maintenance-window', tenantId],
    queryFn: () => maintenanceWindowApi.get(tenantId),
    enabled: !!tenantId,
  });

  const schedule = useMutation({
    mutationFn: () => {
      if (!startsAt || !endsAt) throw new Error('Start and end are both required');
      return maintenanceWindowApi.schedule(tenantId, {
        starts_at: localInputToRFC3339(startsAt),
        ends_at: localInputToRFC3339(endsAt),
        reason: reason || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Maintenance window scheduled', {
        description: `${selectedTenant?.name ?? 'This tenant'}'s POS will be locked to platform owners only for that window.`,
      });
      void qc.invalidateQueries({ queryKey: ['maintenance-window', tenantId] });
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to schedule maintenance window')),
  });

  const cancel = useMutation({
    mutationFn: () => maintenanceWindowApi.cancel(tenantId),
    onSuccess: () => {
      toast.success('Maintenance window cancelled');
      void qc.invalidateQueries({ queryKey: ['maintenance-window', tenantId] });
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to cancel maintenance window')),
  });

  return (
    <div className="space-y-6 py-4">
      <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          While a window is active, every non-platform-owner request to that tenant&apos;s POS is
          blocked with an &quot;Under Maintenance&quot; screen — cashiers cannot even PIN-login.
          Access resumes automatically once the window ends; no manual step needed.
        </span>
      </div>

      <div className="grid gap-2 max-w-md">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tenant</label>
        <select
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium"
        >
          <option value="">Select a tenant…</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
          ))}
        </select>
      </div>

      {tenantId && (
        <>
          {isFetching ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading current status…</p>
          ) : current?.currently_under_repair ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                <div>
                  <p className="font-semibold text-destructive">Currently under maintenance</p>
                  {current.reason && <p className="text-muted-foreground mt-0.5">{current.reason}</p>}
                  {current.ends_at && <p className="text-muted-foreground mt-0.5">Resumes at {new Date(current.ends_at).toLocaleString()}</p>}
                  {current.activated_by && <p className="text-muted-foreground mt-0.5">Scheduled by {current.activated_by}</p>}
                </div>
              </div>
              <button
                onClick={() => setConfirmCancel(true)}
                className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 shrink-0"
              >
                <XCircle className="h-3.5 w-3.5" /> Cancel now
              </button>
            </div>
          ) : current?.ends_at ? (
            <p className="text-sm text-muted-foreground">No active window (last one ended {new Date(current.ends_at).toLocaleString()}).</p>
          ) : (
            <p className="text-sm text-muted-foreground">No maintenance window scheduled for this tenant.</p>
          )}

          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
            <div className="grid gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Starts at</label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ends at (auto-resumes)</label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              />
            </div>
          </div>
          <div className="grid gap-2 max-w-2xl">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reason (shown on the tenant&apos;s banner)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Scheduled data repair — back shortly"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            />
          </div>

          <button
            onClick={() => schedule.mutate()}
            disabled={schedule.isPending || !startsAt || !endsAt}
            className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            {schedule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            Schedule window
          </button>
        </>
      )}

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel maintenance window?"
        description="This immediately restores normal access for this tenant, regardless of the scheduled end time."
        confirmLabel="Cancel window"
        onConfirm={() => { cancel.mutate(); setConfirmCancel(false); }}
      />
    </div>
  );
}
