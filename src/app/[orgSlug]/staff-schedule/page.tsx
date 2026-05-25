'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StaffMember {
  id: string;
  full_name: string;
  role?: string;
}

interface Appointment {
  id: string;
  staff_id?: string;
  customer_name: string;
  date: string;
  time: string;
  duration_minutes: number;
  status: string;
  service_name?: string;
}

function getWeekDates(refDate: Date): Date[] {
  const day = refDate.getDay();
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7am – 7pm

function useStaff() {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  return useQuery({
    queryKey: ['staff-members', tenantID],
    queryFn: () => apiClient.get<{ data: StaffMember[] }>(`/api/v1/${tenantID}/pos/staff`),
    enabled: !!tenantID,
    staleTime: 5 * 60_000,
  });
}

function useAppointmentsByWeek(weekStart: string) {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  return useQuery({
    queryKey: ['appointments-week', tenantID, weekStart],
    queryFn: () => apiClient.get<{ data: Appointment[] }>(`/api/v1/${tenantID}/pos/appointments?week=${weekStart}`),
    enabled: !!tenantID,
    staleTime: 2 * 60_000,
  });
}

function AppointmentBlock({ appt }: { appt: Appointment }) {
  return (
    <div className={cn(
      'text-[10px] font-semibold px-1.5 py-1 rounded-lg truncate max-w-full',
      appt.status === 'confirmed'   && 'bg-emerald-500/15 text-emerald-700',
      appt.status === 'in_progress' && 'bg-amber-500/15 text-amber-700',
      appt.status === 'scheduled'   && 'bg-blue-500/15 text-blue-700',
      appt.status === 'no_show'     && 'bg-red-500/15 text-red-600',
      appt.status === 'cancelled'   && 'bg-muted text-muted-foreground',
    )}>
      {appt.time} {appt.customer_name}
    </div>
  );
}

function StaffSchedulePage() {
  const params = useParams();
  const [weekOffset, setWeekOffset] = useState(0);
  const refDate = new Date();
  refDate.setDate(refDate.getDate() + weekOffset * 7);
  const weekDates = getWeekDates(refDate);
  const weekStart = weekDates[0].toISOString().split('T')[0];

  const { data: staffData, isLoading: staffLoading } = useStaff();
  const { data: apptData, isLoading: apptLoading } = useAppointmentsByWeek(weekStart);

  const staff = staffData?.data ?? [];
  const appointments = apptData?.data ?? [];

  const isLoading = staffLoading || apptLoading;

  function getApptForStaffDay(staffId: string, date: Date): Appointment[] {
    const dateStr = date.toISOString().split('T')[0];
    return appointments.filter((a) => a.staff_id === staffId && a.date === dateStr);
  }

  const weekLabel = `${weekDates[0].toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })} – ${weekDates[6].toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Staff Schedule</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Weekly appointment calendar by staff member</p>
          </div>
        </div>
        {/* Week navigator */}
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset((w) => w - 1)} className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-foreground min-w-[180px] text-center">{weekLabel}</span>
          <button onClick={() => setWeekOffset((w) => w + 1)} className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="h-9 px-3 rounded-xl border border-border text-xs font-semibold hover:bg-accent transition-colors">
              Today
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading schedule…</span>
        </div>
      ) : staff.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <Users className="h-10 w-10 opacity-30" />
          <p className="font-medium">No staff members found</p>
          <p className="text-xs">Add staff members in Settings to see their schedule here</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[700px]">
            <thead>
              <tr>
                <th className="text-left px-3 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider w-32 border-b border-border">Staff</th>
                {weekDates.map((d) => {
                  const isToday = d.toDateString() === new Date().toDateString();
                  return (
                    <th key={d.toISOString()} className={cn('px-2 py-2.5 text-center text-xs font-bold border-b border-border', isToday ? 'text-primary' : 'text-muted-foreground')}>
                      <div>{d.toLocaleDateString('en-KE', { weekday: 'short' })}</div>
                      <div className={cn('text-base font-bold', isToday && 'text-primary')}>{d.getDate()}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {staff.map((s) => {
                const totalAppts = weekDates.reduce((sum, d) => sum + getApptForStaffDay(s.id, d).length, 0);
                return (
                  <tr key={s.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-3 py-3 align-top">
                      <p className="text-sm font-semibold text-foreground truncate">{s.full_name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{totalAppts} appts this week</p>
                    </td>
                    {weekDates.map((d) => {
                      const dayAppts = getApptForStaffDay(s.id, d);
                      const isToday = d.toDateString() === new Date().toDateString();
                      return (
                        <td key={d.toISOString()} className={cn('px-2 py-2 align-top min-w-[100px] border-l border-border/50', isToday && 'bg-primary/3')}>
                          <div className="space-y-1">
                            {dayAppts.map((a) => <AppointmentBlock key={a.id} appt={a} />)}
                            {dayAppts.length === 0 && (
                              <span className="text-[10px] text-muted-foreground/40">—</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function StaffSchedulePageGated() {
  return (
    <ModuleGate moduleKey="staff_schedule" fallback={<ModuleUnavailablePage moduleKey="staff_schedule" />}>
      <StaffSchedulePage />
    </ModuleGate>
  );
}
