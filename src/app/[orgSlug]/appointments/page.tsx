'use client';

import { Badge, Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import {
  useAppointments,
  useCreateAppointment,
  useUpdateAppointmentStatus,
} from '@/hooks/useAppointments';
import type { Appointment, AppointmentStatus, CreateAppointmentInput } from '@/hooks/useAppointments';
import {
  Calendar,
  Clock,
  Loader2,
  Plus,
  User,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const STATUS_BADGE: Record<AppointmentStatus, 'default' | 'success' | 'warning' | 'error' | 'outline'> = {
  scheduled: 'default',
  confirmed: 'success',
  in_progress: 'warning',
  completed: 'success',
  no_show: 'error',
  cancelled: 'outline',
};

const STATUS_OPTIONS: AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'no_show',
  'cancelled',
];

function BookingForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const create = useCreateAppointment();
  const [form, setForm] = useState<CreateAppointmentInput>({
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    duration_minutes: 30,
    staff_id: '',
    customer_name: '',
    customer_phone: '',
    service_id: '',
    notes: '',
  });

  const set = (key: keyof CreateAppointmentInput, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_name || !form.date || !form.time) {
      toast.error('Please fill in required fields');
      return;
    }
    create.mutate(form, {
      onSuccess: () => {
        toast.success('Appointment booked');
        onSuccess();
        onClose();
      },
      onError: () => toast.error('Failed to book appointment'),
    });
  };

  const inputClass =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Book Appointment</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">
                  Date *
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">
                  Time *
                </label>
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => set('time', e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">
                Customer Name *
              </label>
              <input
                type="text"
                value={form.customer_name}
                onChange={(e) => set('customer_name', e.target.value)}
                placeholder="Customer name"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">
                Customer Phone
              </label>
              <input
                type="tel"
                value={form.customer_phone ?? ''}
                onChange={(e) => set('customer_phone', e.target.value)}
                placeholder="+254..."
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">
                  Staff ID
                </label>
                <input
                  type="text"
                  value={form.staff_id}
                  onChange={(e) => set('staff_id', e.target.value)}
                  placeholder="Staff member"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">
                  Service ID
                </label>
                <input
                  type="text"
                  value={form.service_id}
                  onChange={(e) => set('service_id', e.target.value)}
                  placeholder="Service"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">
                Duration (minutes)
              </label>
              <input
                type="number"
                value={form.duration_minutes ?? 30}
                onChange={(e) => set('duration_minutes', parseInt(e.target.value, 10) || 30)}
                min={5}
                step={5}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">
                Notes
              </label>
              <textarea
                value={form.notes ?? ''}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Optional notes..."
                rows={2}
                className={inputClass}
              />
            </div>
            <Button
              variant="primary"
              className="w-full"
              type="submit"
              disabled={create.isPending}
            >
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Plus className="h-4 w-4 mr-1.5" />
              )}
              Book Appointment
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AppointmentsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [showBooking, setShowBooking] = useState(false);

  const { data, isLoading, refetch } = useAppointments({
    date: dateFilter,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });
  const updateStatus = useUpdateAppointmentStatus();

  const appointments = data?.data ?? [];

  const handleStatusChange = (id: string, status: AppointmentStatus) => {
    updateStatus.mutate(
      { id, status },
      {
        onSuccess: () => toast.success(`Status updated to ${status.replace('_', ' ')}`),
        onError: () => toast.error('Failed to update status'),
      },
    );
  };

  const statusFilters = ['all', ...STATUS_OPTIONS];

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Appointments</h1>
          <p className="text-muted-foreground mt-1">Manage bookings and scheduling.</p>
        </div>
        <Button variant="primary" onClick={() => setShowBooking(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Book Appointment
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex gap-1">
          {statusFilters.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all',
                statusFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent/30 text-muted-foreground hover:text-foreground',
              )}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-bold">No appointments found</p>
          <p className="text-sm">Book a new appointment to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map((apt) => (
            <Card key={apt.id} className="border transition-all hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex flex-col items-center px-3 py-2 rounded-xl bg-accent/20 text-center min-w-[64px]">
                      <span className="text-lg font-bold leading-tight">{apt.time}</span>
                      <span className="text-[10px] text-muted-foreground font-bold">
                        {apt.duration_minutes}min
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold truncate">{apt.customer_name}</span>
                        {apt.customer_phone && (
                          <span className="text-xs text-muted-foreground">{apt.customer_phone}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {apt.service_name && (
                          <span className="font-bold">{apt.service_name}</span>
                        )}
                        {apt.staff_name && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {apt.staff_name}
                          </span>
                        )}
                      </div>
                      {apt.notes && (
                        <p className="text-[11px] text-muted-foreground mt-1 italic truncate max-w-[300px]">
                          {apt.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_BADGE[apt.status]} className="text-[10px]">
                      {apt.status.replace('_', ' ')}
                    </Badge>
                    <select
                      value={apt.status}
                      onChange={(e) =>
                        handleStatusChange(apt.id, e.target.value as AppointmentStatus)
                      }
                      className="rounded-lg border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showBooking && (
        <BookingForm
          onClose={() => setShowBooking(false)}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  );
}
