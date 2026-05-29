'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Loader2 } from 'lucide-react';
import { useStaffAdmin } from '@/hooks/useStaff';
import { useStaffSchedule } from '@/hooks/useStaffSchedule';
import { useAuthStore } from '@/store/auth';
import type { StaffMember } from '@/lib/api/staff';
import { StaffShiftDrawer } from './staff-shift-drawer';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', cashier: 'Cashier', waiter: 'Waiter',
  kitchen: 'Kitchen', bar: 'Bar', receptionist: 'Reception',
  pharmacist: 'Pharmacist', stylist: 'Stylist', therapist: 'Therapist', technician: 'Technician',
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-KE', opts)} – ${end.toLocaleDateString('en-KE', opts)}`;
}

function StaffScheduleRow({
  staff,
  weekStart,
  today,
  onSelect,
}: {
  staff: StaffMember;
  weekStart: Date;
  today: Date;
  onSelect: (staff: StaffMember) => void;
}) {
  const { data: schedule, isLoading } = useStaffSchedule(staff.id);
  const scheduleByDay = schedule
    ? Object.fromEntries(schedule.map((e) => [e.day_of_week, e]))
    : {};

  return (
    <tr
      className="hover:bg-accent/5 cursor-pointer transition-colors group"
      onClick={() => onSelect(staff)}
    >
      <td className="px-4 py-3 sticky left-0 bg-background z-10 border-r border-border group-hover:bg-accent/5 transition-colors">
        <div className="flex items-center gap-2 min-w-[140px]">
          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
            {staff.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{staff.name}</p>
            <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[staff.role] ?? staff.role}</p>
          </div>
        </div>
      </td>

      {Array.from({ length: 7 }, (_, i) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dayOfWeek = date.getDay();
        const entry = scheduleByDay[dayOfWeek];
        const isToday = date.toDateString() === today.toDateString();

        return (
          <td key={i} className={`px-2 py-3 text-center ${isToday ? 'bg-primary/5' : ''}`}>
            {isLoading ? (
              <span className="inline-block w-3 h-3 rounded-full bg-muted animate-pulse" />
            ) : entry?.is_available ? (
              <div className="flex flex-col items-center gap-0.5">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                <p className="text-[10px] text-green-700 dark:text-green-400 leading-tight font-mono whitespace-nowrap">
                  {entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)}
                </p>
              </div>
            ) : (
              <span className="inline-block w-2 h-2 rounded-full bg-muted/60" />
            )}
          </td>
        );
      })}

      <td className="px-3 py-3 text-right">
        <span className="text-[10px] text-primary font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
          Edit →
        </span>
      </td>
    </tr>
  );
}

export function ShiftPlannerPanel() {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';

  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  const { data, isLoading } = useStaffAdmin(tenantId);
  const members: StaffMember[] = (data?.data ?? []).filter((m) => m.is_active);

  const today = new Date();
  const isCurrentWeek = weekStart.toDateString() === getWeekStart(today).toDateString();

  function prevWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  }
  function nextWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  }

  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return {
      short: DAY_SHORT[date.getDay()],
      date: date.getDate(),
      isToday: date.toDateString() === today.toDateString(),
    };
  });

  return (
    <div className="space-y-4">
      {/* Week navigator */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{formatWeekRange(weekStart)}</span>
          {isCurrentWeek && (
            <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              This week
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={prevWeek}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {!isCurrentWeek && (
            <button
              onClick={() => setWeekStart(getWeekStart(today))}
              className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors font-medium"
            >
              Today
            </button>
          )}
          <button
            onClick={nextWeek}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Calendar className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No active staff members</p>
          <p className="text-xs text-muted-foreground mt-1">Add staff in Settings → Team</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-accent/20 border-b border-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground sticky left-0 bg-accent/20 z-10 border-r border-border min-w-[160px]">
                    Staff
                  </th>
                  {dayLabels.map((d, i) => (
                    <th
                      key={i}
                      className={`text-center px-2 py-3 min-w-[72px] ${d.isToday ? 'bg-primary/10' : ''}`}
                    >
                      <p className={`text-xs font-semibold ${d.isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                        {d.short}
                      </p>
                      <p className={`text-[11px] font-bold mt-0.5 ${d.isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                        {d.date}
                      </p>
                    </th>
                  ))}
                  <th className="px-3 py-3 min-w-[48px]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((m) => (
                  <StaffScheduleRow
                    key={m.id}
                    staff={m}
                    weekStart={weekStart}
                    today={today}
                    onSelect={setSelectedStaff}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground">
        Click any staff row to edit their recurring weekly schedule.
      </p>

      <StaffShiftDrawer
        staff={selectedStaff}
        open={!!selectedStaff}
        onClose={() => setSelectedStaff(null)}
      />
    </div>
  );
}
