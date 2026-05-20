'use client';

import { cn } from '@/lib/utils';
import {
  useAppointment,
  useCheckInAppointment,
  useStartAppointment,
  useCompleteAppointment,
  useCancelAppointment,
  useNoShowAppointment,
  type AppointmentStatus,
} from '@/hooks/useAppointments';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Phone,
  User,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled:   'bg-muted text-muted-foreground',
  confirmed:   'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  in_progress: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  completed:   'bg-green-500/10 text-green-700 dark:text-green-400',
  no_show:     'bg-red-500/10 text-red-700 dark:text-red-400',
  cancelled:   'bg-muted text-muted-foreground line-through',
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled:   'Scheduled',
  confirmed:   'Confirmed / Checked-In',
  in_progress: 'In Progress',
  completed:   'Completed',
  no_show:     'No Show',
  cancelled:   'Cancelled',
};

function ActionButton({
  label,
  icon: Icon,
  onClick,
  loading,
  variant = 'default',
}: {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  loading: boolean;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}) {
  const cls = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    success: 'bg-green-600 text-white hover:bg-green-700',
    danger:  'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    warning: 'bg-amber-500 text-white hover:bg-amber-600',
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn('flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm disabled:opacity-60 transition-colors', cls)}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}

export default function AppointmentDetailPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const id = params?.id as string;

  const { data: appt, isLoading } = useAppointment(id);
  const checkIn   = useCheckInAppointment();
  const start     = useStartAppointment();
  const complete  = useCompleteAppointment();
  const cancel    = useCancelAppointment();
  const noShow    = useNoShowAppointment();

  async function act(mutation: { mutateAsync: (id: string) => Promise<any> }, label: string) {
    try {
      await mutation.mutateAsync(id);
      toast.success(label);
    } catch {
      toast.error(`Failed: ${label}`);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  if (!appt) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Appointment not found.{' '}
        <Link href={`/${orgSlug}/appointments`} className="text-primary underline">Back</Link>
      </div>
    );
  }

  const status = (appt as any).status as AppointmentStatus;
  const startTime = (appt as any).start_time ?? (appt as any).date;
  const endTime   = (appt as any).end_time;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Link
        href={`/${orgSlug}/appointments`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Appointments
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-bold">{(appt as any).customer_name}</p>
            {(appt as any).customer_phone && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                <Phone className="h-3.5 w-3.5" />
                {(appt as any).customer_phone}
              </div>
            )}
          </div>
          <span className={cn('px-3 py-1 rounded-full text-xs font-semibold', STATUS_COLORS[status])}>
            {STATUS_LABELS[status]}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>{startTime ? new Date(startTime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              {startTime ? new Date(startTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'}
              {endTime ? ` – ${new Date(endTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
          </div>
          {(appt as any).service_sku && (
            <div className="flex items-center gap-2 text-muted-foreground col-span-2">
              <User className="h-4 w-4 shrink-0" />
              <span>Service: {(appt as any).service_sku}</span>
            </div>
          )}
        </div>

        {(appt as any).notes && (
          <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            {(appt as any).notes}
          </div>
        )}
      </div>

      {/* Action buttons — contextual by status */}
      {status !== 'completed' && status !== 'cancelled' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</p>
          <div className="flex flex-wrap gap-3">
            {status === 'scheduled' && (
              <ActionButton
                label="Check In"
                icon={CheckCircle2}
                variant="success"
                onClick={() => act(checkIn, 'Customer checked in')}
                loading={checkIn.isPending}
              />
            )}
            {status === 'confirmed' && (
              <ActionButton
                label="Start Service"
                icon={Clock}
                variant="warning"
                onClick={() => act(start, 'Service started')}
                loading={start.isPending}
              />
            )}
            {status === 'in_progress' && (
              <ActionButton
                label="Complete"
                icon={CheckCircle2}
                variant="success"
                onClick={() => act(complete, 'Appointment completed')}
                loading={complete.isPending}
              />
            )}
            {(status === 'scheduled' || status === 'confirmed') && (
              <ActionButton
                label="No Show"
                icon={XCircle}
                variant="danger"
                onClick={() => act(noShow, 'Marked as no-show')}
                loading={noShow.isPending}
              />
            )}
            <ActionButton
              label="Cancel"
              icon={XCircle}
              variant="danger"
              onClick={() => act(cancel, 'Appointment cancelled')}
              loading={cancel.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
}
