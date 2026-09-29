'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, Calendar, CalendarClock, ClipboardList, Factory, Grid3x3, ListOrdered,
  PackageCheck, Plus, Users,
} from 'lucide-react';

import { apiClient } from '@/lib/api/client';
import { P } from '@/lib/rbac/permissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { usePermissions } from '@/hooks/usePermissions';
import { useJobSummary, useOutletServiceProfile } from '@/hooks/useServiceJobs';
import { KPICard, QuickAction, RecentOrdersCard, fmtNum, useTenantID } from './widgets';

interface DeskAction {
  icon: React.ElementType;
  label: string;
  desc: string;
  href: string;
}

const PRODUCTION_PERMS = [P.KDS_VIEW, P.KDS_CHANGE, P.KDS_MANAGE];

/**
 * The quick actions a front-desk or trade role gets on THIS outlet. Every entry is gated on the
 * outlet's modules (use case, service profile, outlet toggles) and the user's permissions, so a
 * role never sees another use case's screens: a print shop's reception gets job intake and the
 * production board, a salon's gets appointments and the walk-in queue, a restaurant's gets
 * reservations and tables.
 */
function useDeskActions(orgSlug: string): DeskAction[] {
  const { hasModule } = useModuleAccess();
  const { canAny } = usePermissions();
  const { profile, isJobWorkflow } = useOutletServiceProfile();
  const jobLabel = profile?.job_label ?? 'Job';
  const href = (p: string) => `/${orgSlug}${p}`;

  const actions: (DeskAction | false)[] = [
    hasModule('new_order') && canAny([P.ORDERS_ADD]) && (isJobWorkflow
      ? { icon: Plus, label: `New ${jobLabel}`, desc: 'Take in a customer job', href: href('/order') }
      : { icon: Plus, label: 'New Sale', desc: 'Serve a customer', href: href('/order') }),
    hasModule('orders') && canAny([P.ORDERS_VIEW, P.ORDERS_VIEW_OWN, P.ORDERS_ADD]) && (isJobWorkflow
      ? { icon: PackageCheck, label: `${jobLabel}s & Collection`, desc: 'Track jobs, take balances, hand over', href: href('/orders') }
      : { icon: ClipboardList, label: 'Orders', desc: 'View active orders', href: href('/orders') }),
    hasModule('production') && canAny(PRODUCTION_PERMS) &&
      { icon: Factory, label: 'Production Board', desc: `${jobLabel}s by production stage`, href: href('/production') },
    hasModule('appointments') && canAny([P.APPOINTMENTS_VIEW, P.APPOINTMENTS_CHANGE]) &&
      { icon: Calendar, label: 'Appointments', desc: "Today's bookings and check-ins", href: href('/appointments') },
    hasModule('queue') && canAny([P.QUEUE_VIEW]) &&
      { icon: ListOrdered, label: 'Walk-in Queue', desc: 'Customers waiting to be served', href: href('/queue') },
    hasModule('reservations') && canAny([P.TABLES_VIEW]) &&
      { icon: Users, label: 'Reservations', desc: 'Review & confirm table bookings', href: href('/reservations') },
    hasModule('tables') && canAny([P.TABLES_VIEW]) &&
      { icon: Grid3x3, label: 'Tables', desc: 'Seat guests and see open tables', href: href('/tables') },
  ];
  return actions.filter((a): a is DeskAction => !!a);
}

function DeskHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-xl font-bold font-display">{title}</h1>
      <p className="text-sm text-muted-foreground mt-0.5">
        {subtitle ?? new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
    </div>
  );
}

function DeskActions({ actions }: { actions: DeskAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {actions.map((a, i) => (
        <QuickAction key={a.href} icon={a.icon} label={a.label} desc={a.desc} href={a.href} accent={i === 0} />
      ))}
    </div>
  );
}

/**
 * Receptionist dashboard for every outlet that is not a hotel front desk (see
 * ReceptionistDashboard). A job-workflow services outlet shows the job book; an appointment
 * outlet shows today's bookings; the rest show only their outlet's actions.
 */
export function FrontDeskDashboard({ orgSlug }: { orgSlug: string }) {
  const tenantID = useTenantID();
  const { hasModule } = useModuleAccess();
  const { profile, isJobWorkflow } = useOutletServiceProfile();
  const actions = useDeskActions(orgSlug);
  const { data: jobs, isLoading: jobsLoading } = useJobSummary(isJobWorkflow);

  const showAppointments = !isJobWorkflow && hasModule('appointments');
  const today = new Date().toISOString().split('T')[0];
  const { data: apptData, isLoading: apptLoading } = useQuery({
    queryKey: ['dashboard-appointments-today', tenantID, today],
    queryFn: () => apiClient.get<{ data: { status: string }[] }>(`/api/v1/${tenantID}/pos/appointments?date=${today}`),
    enabled: !!tenantID && showAppointments, refetchInterval: 60_000, retry: false,
  });
  const appts = apptData?.data ?? [];
  const waiting = appts.filter((a) => ['scheduled', 'confirmed'].includes(a.status)).length;
  const inService = appts.filter((a) => a.status === 'in_progress').length;

  return (
    <div className="p-6 space-y-6">
      <DeskHeader title={profile ? `${profile.label} Front Desk` : 'Front Desk'} />
      {isJobWorkflow && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="In Production" value={fmtNum(jobs?.in_production ?? 0)} sub={`${fmtNum(jobs?.awaiting_proof ?? 0)} waiting on the customer`} icon={Factory} loading={jobsLoading} />
          <KPICard label="Ready for Collection" value={fmtNum(jobs?.ready_for_collection ?? 0)} sub="call the customer" icon={PackageCheck} loading={jobsLoading} />
          <KPICard label="Due Today" value={fmtNum(jobs?.due_today ?? 0)} sub="promised today" icon={CalendarClock} loading={jobsLoading} />
          <KPICard label="Overdue" value={fmtNum(jobs?.overdue ?? 0)} sub="past the promised time" icon={AlertTriangle} loading={jobsLoading} />
        </div>
      )}
      {showAppointments && (
        <div className="grid grid-cols-3 gap-4">
          <KPICard label="Appointments Today" value={fmtNum(appts.length)} icon={Calendar} loading={apptLoading} />
          <KPICard label="Still to Arrive" value={fmtNum(waiting)} icon={Users} loading={apptLoading} />
          <KPICard label="In Service" value={fmtNum(inService)} icon={CalendarClock} loading={apptLoading} />
        </div>
      )}
      <DeskActions actions={actions} />
      <RecentOrdersCard orgSlug={orgSlug} />
    </div>
  );
}

/**
 * Dashboard for a services trade specialist (technician, stylist, therapist). On a job outlet
 * the technician works from the production board, so they go straight there, the way kitchen
 * staff go to the KDS; everyone else gets their outlet's actions.
 */
export function ServiceStaffDashboard({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const { hasModule } = useModuleAccess();
  const { canAny } = usePermissions();
  const { isJobWorkflow } = useOutletServiceProfile();
  const actions = useDeskActions(orgSlug);
  const toBoard = isJobWorkflow && hasModule('production') && canAny(PRODUCTION_PERMS);

  useEffect(() => {
    if (toBoard) router.replace(`/${orgSlug}/production`);
  }, [orgSlug, router, toBoard]);

  if (toBoard) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Factory className="h-10 w-10 animate-pulse" />
          <p className="text-sm">Loading Production Board…</p>
        </div>
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6">
      <DeskHeader title="Your day" subtitle="Your bookings, queue and orders" />
      <DeskActions actions={actions} />
      <RecentOrdersCard orgSlug={orgSlug} />
    </div>
  );
}
