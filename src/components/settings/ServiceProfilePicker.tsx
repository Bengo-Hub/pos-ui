'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, CalendarClock, ClipboardList, ListOrdered, Loader2 } from 'lucide-react';

import { usePOSSettings } from '@/hooks/usePOSSettings';
import { useServiceProfiles, useUpdateServiceProfile } from '@/hooks/useServiceJobs';
import type { ServiceWorkflow } from '@/lib/api/service-jobs';
import { cn } from '@/lib/utils';

const WORKFLOW_META: Record<ServiceWorkflow, { label: string; icon: React.ElementType }> = {
  job: { label: 'Job orders + production board', icon: ClipboardList },
  appointment: { label: 'Appointments', icon: CalendarClock },
  queue: { label: 'Walk-in queue', icon: ListOrdered },
};

/**
 * Picks a services outlet's sub use case (printing, salon, garage, laundry, ...). The profile
 * decides the terminal workflow, which catalog services the till shows (the tenant's own
 * inventory items tagged for that trade) and the production stages. Picking a job profile turns
 * on the production board and creates its default station; nothing an admin already set up is
 * removed.
 */
export function ServiceProfilePicker({ canEdit }: { canEdit: boolean }) {
  const { data: settings } = usePOSSettings();
  const { data: profiles, isLoading } = useServiceProfiles();
  const update = useUpdateServiceProfile();
  const current = settings?.service_profile ?? '';
  const currentProfile = profiles?.find((p) => p.key === current);
  const [deposit, setDeposit] = useState('');

  useEffect(() => {
    setDeposit(settings?.job_deposit_percent != null ? String(settings.job_deposit_percent) : '');
  }, [settings?.job_deposit_percent]);

  if (isLoading) {
    return <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border p-3 sm:p-4">
      <div>
        <p className="text-sm font-semibold">Type of service business</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Sets the workflow and shows only the catalog services of this trade on the till. Tag your
          services in Inventory with the matching service type.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {(profiles ?? []).map((p) => {
          const meta = WORKFLOW_META[p.workflow];
          const Icon = meta.icon;
          const active = p.key === current;
          return (
            <button
              key={p.key}
              type="button"
              disabled={!canEdit || update.isPending}
              onClick={() => !active && update.mutate({ service_profile: p.key })}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed',
                active ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{p.label}</span>
                {active && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                <Icon className="h-3 w-3" /> {meta.label}
              </span>
            </button>
          );
        })}
      </div>

      {currentProfile?.workflow === 'job' && (
        <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-end">
          <label className="space-y-1">
            <span className="text-xs font-semibold">Default deposit (% of the job)</span>
            <input
              type="number"
              min={0}
              max={100}
              disabled={!canEdit}
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              className="h-9 w-32 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          {canEdit && (
            <button
              type="button"
              disabled={update.isPending || deposit === '' || Number(deposit) < 0 || Number(deposit) > 100}
              onClick={() => update.mutate({ job_deposit_percent: Number(deposit) })}
              className="h-9 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              Save deposit
            </button>
          )}
          <p className="text-[11px] text-muted-foreground sm:ml-2">
            Suggested when reception creates a {currentProfile.job_label.toLowerCase()}; the cashier can change it.
          </p>
        </div>
      )}
    </div>
  );
}
