'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { Badge, Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import {
  useAppointments,
  useCreateAppointment,
  useNoShowAppointment,
  useUpdateAppointmentStatus,
} from '@/hooks/useAppointments';
import type { Appointment, AppointmentStatus, CreateAppointmentInput } from '@/hooks/useAppointments';
import { useMenuItems } from '@/hooks/usePOS';
import { usePermissions, P } from '@/hooks/usePermissions';
import {
  Calendar,
  Loader2,
  Plus,
  User,
  UserX,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useAuthStore } from '@/store/auth';

function useStaffList() {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  return useQuery({
    queryKey: ['staff-members', tenantID],
    queryFn: () => apiClient.get<{ data: { id: string; full_name: string }[] }>(`/api/v1/${tenantID}/pos/staff`),
    enabled: !!tenantID,
    staleTime: 5 * 60_000,
  });
}
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
  const { data: staffData } = useStaffList();
  const staffList = staffData?.data ?? [];

  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false);
  const [selectedServiceName, setSelectedServiceName] = useState('');
  const { data: serviceData } = useMenuItems({
    itemType: 'SERVICE',
    search: serviceSearch || undefined,
    limit: 20,
  });
  const serviceList = serviceData?.data ?? [];

  const [form, setForm] = useState<CreateAppointmentInput & { deposit_amount?: number }>({
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    duration_minutes: 30,
    staff_id: '',
    customer_name: '',
    customer_phone: '',
    service_id: '',
    notes: '',
    deposit_amount: undefined,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_name || !form.date || !form.time) {
      toast.error('Please fill in required fields');
      return;
    }
    if (!form.service_id) {
      toast.error('Please select a service');
      return;
    }
    const { deposit_amount, ...rest } = form;
    const payload = deposit_amount ? { ...rest, deposit_amount } : rest;
    create.mutate(payload, {
      onSuccess: () => {
        toast.success('Appointment booked');
        onSuccess();
        onClose();
      },
      onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to book appointment')),
    });
  };

  const inputClass =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
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
                <label className="text-xs font-bold text-muted-foreground mb-1 block">Date *</label>
                <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inputClass} required />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">Time *</label>
                <input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} className={inputClass} required />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Customer Name *</label>
              <input type="text" value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} placeholder="Customer name" className={inputClass} required />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Customer Phone</label>
              <input type="tel" value={form.customer_phone ?? ''} onChange={(e) => set('customer_phone', e.target.value)} placeholder="+254..." className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Service *</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search services…"
                  value={selectedServiceName || serviceSearch}
                  onChange={(e) => {
                    setServiceSearch(e.target.value);
                    setSelectedServiceName('');
                    setForm((prev) => ({ ...prev, service_id: '' }));
                    setServiceDropdownOpen(true);
                  }}
                  onFocus={() => setServiceDropdownOpen(true)}
                  className={cn(inputClass, !form.service_id && 'border-amber-400/60')}
                  autoComplete="off"
                />
                {!form.service_id && (
                  <p className="text-[10px] text-amber-500 mt-0.5">Required — select a service</p>
                )}
                {serviceDropdownOpen && serviceList.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {serviceList.map((svc) => (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => {
                          setSelectedServiceName(svc.name);
                          setServiceSearch('');
                          setServiceDropdownOpen(false);
                          setForm((prev) => ({
                            ...prev,
                            service_id: svc.id,
                            duration_minutes: svc.duration_minutes ?? prev.duration_minutes,
                          }));
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2"
                      >
                        <span className="font-medium truncate">{svc.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {svc.duration_minutes ? `${svc.duration_minutes}min` : ''}{svc.price ? ` · KES ${svc.price.toLocaleString()}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Staff Member</label>
              <select value={form.staff_id} onChange={(e) => set('staff_id', e.target.value)} className={inputClass}>
                <option value="">— Unassigned —</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">Duration (min)</label>
                <input type="number" value={form.duration_minutes ?? 30} onChange={(e) => set('duration_minutes', parseInt(e.target.value, 10) || 30)} min={5} step={5} className={inputClass} />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">Deposit (KES)</label>
                <input type="number" value={form.deposit_amount ?? ''} onChange={(e) => set('deposit_amount', e.target.value ? parseFloat(e.target.value) : undefined)} min={0} step={50} placeholder="0" className={inputClass} />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Notes</label>
              <textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Optional notes..." rows={2} className={inputClass} />
            </div>
            <Button variant="primary" className="w-full" type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Book Appointment
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function AppointmentsPage() {
  const { can } = usePermissions();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [showBooking, setShowBooking] = useState(false);
  const canChange = can(P.APPOINTMENTS_CHANGE);

  const { data, isLoading, refetch } = useAppointments({
    date: dateFilter,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });
  const updateStatus = useUpdateAppointmentStatus();
  const noShow = useNoShowAppointment();

  const appointments = data?.data ?? [];

  const handleStatusChange = (id: string, status: AppointmentStatus) => {
    updateStatus.mutate(
      { id, status },
      {
        onSuccess: () => toast.success(`Status updated to ${status.replace('_', ' ')}`),
        onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to update status')),
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
        {can(P.APPOINTMENTS_ADD) && (
          <Button variant="primary" onClick={() => setShowBooking(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Book Appointment
          </Button>
        )}
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
                    {canChange && (apt.status === 'scheduled' || apt.status === 'confirmed') && (
                      <button
                        type="button"
                        onClick={() => {
                          noShow.mutate(apt.id, { onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to mark no-show')) });
                        }}
                        disabled={noShow.isPending}
                        title="Mark as No Show"
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 text-red-500 text-[10px] font-bold hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <UserX className="h-3 w-3" />
                        No Show
                      </button>
                    )}
                    {canChange && (
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
                    )}
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

export default function AppointmentsPageGated() {
  return (
    <ModuleGate moduleKey="appointments" fallback={<ModuleUnavailablePage moduleKey="appointments" />}>
      <AppointmentsPage />
    </ModuleGate>
  );
}
