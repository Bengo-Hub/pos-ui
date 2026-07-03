'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Loader2 } from 'lucide-react';
import { useStaffAdmin } from '@/hooks/useStaff';
import { useStaffSchedule } from '@/hooks/useStaffSchedule';
import { useAllShiftOverrides } from '@/hooks/useShiftOverrides';
import { useLeaveRequests } from '@/hooks/useLeaveRequests';
import { useAllActiveRotationDetails } from '@/hooks/useShiftRotations';
import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore } from '@/store/outlet-filter';
import type { StaffMember } from '@/lib/api/staff';
import type { ShiftOverride } from '@/lib/api/shift-overrides';
import type { LeaveRequest } from '@/lib/api/leave-requests';
import type { ShiftRotationSlot } from '@/lib/api/shift-rotations';
import { StaffShiftDrawer } from './staff-shift-drawer';

/** Resolve which 1-based cycle day a calendar date falls on for a given rotation. */
function resolveCycleDay(date: Date, startDateStr: string, cycleDays: number): number {
  const start = new Date(startDateStr.slice(0, 10) + 'T00:00:00Z');
  const cell = new Date(date.toISOString().slice(0, 10) + 'T00:00:00Z');
  const diffDays = Math.floor((cell.getTime() - start.getTime()) / 86_400_000);
  return ((diffDays % cycleDays) + cycleDays) % cycleDays + 1;
}

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

function CellIndicator({
  override, leave, rotationSlot, isLoading, isAvailable, startTime, endTime,
}: {
  override?: ShiftOverride;
  leave?: LeaveRequest;
  rotationSlot?: ShiftRotationSlot;
  isLoading: boolean;
  isAvailable: boolean;
  startTime?: string;
  endTime?: string;
}) {
  if (override?.override_type === 'off_duty') {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
        <p className="text-[10px] text-red-600 dark:text-red-400 leading-tight font-semibold">Off</p>
      </div>
    );
  }
  if ((override?.override_type === 'manual_shift' || override?.override_type === 'half_day') && override.start_time && override.end_time) {
    const color = override.override_type === 'half_day' ? 'amber' : 'blue';
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className={`inline-block w-2 h-2 rounded-full bg-${color}-500`} />
        <p className={`text-[10px] text-${color}-700 dark:text-${color}-400 leading-tight font-mono whitespace-nowrap`}>
          {override.start_time.slice(0, 5)}–{override.end_time.slice(0, 5)}
        </p>
      </div>
    );
  }
  if (leave) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="inline-block w-2 h-2 rounded-full bg-slate-400" />
        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Leave</p>
      </div>
    );
  }
  if (rotationSlot) {
    if (rotationSlot.is_off_day) {
      return (
        <div className="flex flex-col items-center gap-0.5">
          <span className="inline-block w-2 h-2 rounded-full bg-violet-400" />
          <p className="text-[10px] text-violet-600 dark:text-violet-400 leading-tight font-semibold">R·Off</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="inline-block w-2 h-2 rounded-full bg-violet-500" />
        <p className="text-[10px] text-violet-700 dark:text-violet-400 leading-tight font-mono whitespace-nowrap">
          {rotationSlot.start_time.slice(0, 5)}–{rotationSlot.end_time.slice(0, 5)}
        </p>
      </div>
    );
  }
  if (isLoading) return <span className="inline-block w-3 h-3 rounded-full bg-muted animate-pulse" />;
  if (isAvailable) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
        {startTime && endTime && (
          <p className="text-[10px] text-green-700 dark:text-green-400 leading-tight font-mono whitespace-nowrap">
            {startTime.slice(0, 5)}–{endTime.slice(0, 5)}
          </p>
        )}
      </div>
    );
  }
  return <span className="inline-block w-2 h-2 rounded-full bg-muted/60" />;
}

function StaffScheduleRow({
  staff, weekStart, today, onSelect, overrideByKey, leaveByKey, weekSlotMap,
}: {
  staff: StaffMember;
  weekStart: Date;
  today: Date;
  onSelect: (staff: StaffMember) => void;
  overrideByKey: Record<string, ShiftOverride>;
  leaveByKey: Record<string, LeaveRequest>;
  weekSlotMap: Record<string, ShiftRotationSlot>;
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
        const dateStr = date.toISOString().slice(0, 10);
        const key = `${staff.id}_${dateStr}`;
        const entry = scheduleByDay[dayOfWeek];
        const isToday = date.toDateString() === today.toDateString();
        const rotationSlot = weekSlotMap[key];

        return (
          <td key={i} className={`px-2 py-3 text-center ${isToday ? 'bg-primary/5' : ''}`}>
            <CellIndicator
              override={overrideByKey[key]}
              leave={leaveByKey[key]}
              rotationSlot={rotationSlot}
              isLoading={isLoading}
              isAvailable={entry?.is_available ?? false}
              startTime={entry?.start_time}
              endTime={entry?.end_time}
            />
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
  // Scope the planner to the CURRENT outlet so staff/roles from other outlets & use cases don't
  // mix (e.g. a Pharmacist/Therapist appearing on a hospitality outlet's roster). When an HQ admin
  // has drilled into an outlet, use that; otherwise the operator's home outlet.
  const drillOutletId = useOutletFilterStore((s) => s.selectedOutlet?.id);
  const homeOutletId = useAuthStore((s) => s.selectedOutletId || s.outlet?.id);
  const currentOutletId = drillOutletId || homeOutletId || '';

  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  const { data, isLoading } = useStaffAdmin(tenantId);
  const members: StaffMember[] = (data?.data ?? [])
    .filter((m) => m.is_active)
    // Only show staff assigned to the current outlet. Without a resolved outlet (pure HQ view)
    // fall back to showing all so nothing disappears unexpectedly.
    .filter((m) => !currentOutletId || m.outlet_id === currentOutletId);

  const today = new Date();
  const isCurrentWeek = weekStart.toDateString() === getWeekStart(today).toDateString();

  const weekFromStr = weekStart.toISOString().slice(0, 10);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekToStr = weekEnd.toISOString().slice(0, 10);

  const { data: rawOverrides = [] } = useAllShiftOverrides(weekFromStr, weekToStr);
  const { data: rawLeaves = [] } = useLeaveRequests('approved');

  // All active rotations + their slots (covers staff split across multiple rotations)
  const { rotationsWithSlots, activeRotations } = useAllActiveRotationDetails();

  const overrideByKey = useMemo(() => {
    const m: Record<string, ShiftOverride> = {};
    for (const ov of rawOverrides) {
      m[`${ov.staff_member_id}_${ov.date.slice(0, 10)}`] = ov;
    }
    return m;
  }, [rawOverrides]);

  // Pre-compute rotation slots for each staff × calendar date in the visible week.
  // Key: `${staffId}_${dateStr}`. First matching rotation wins (staff should be in one rotation).
  const weekSlotMap = useMemo(() => {
    const m: Record<string, ShiftRotationSlot> = {};
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const dateStr = date.toISOString().slice(0, 10);
      for (const { rotation, slots } of rotationsWithSlots) {
        const cycleDay = resolveCycleDay(date, rotation.start_date, rotation.cycle_days);
        for (const slot of slots) {
          if (slot.cycle_day === cycleDay) {
            const key = `${slot.staff_member_id}_${dateStr}`;
            if (!m[key]) m[key] = slot;
          }
        }
      }
    }
    return m;
  }, [rotationsWithSlots, weekStart]);

  const leaveByKey = useMemo(() => {
    const m: Record<string, LeaveRequest> = {};
    for (const lv of rawLeaves) {
      const start = new Date(lv.start_date);
      const end = new Date(lv.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        m[`${lv.staff_member_id}_${d.toISOString().slice(0, 10)}`] = lv;
      }
    }
    return m;
  }, [rawLeaves]);

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
      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        {[
          { dot: 'bg-green-500', label: 'Scheduled' },
          { dot: 'bg-violet-500', label: 'Rotation' },
          { dot: 'bg-blue-500', label: 'Override' },
          { dot: 'bg-amber-500', label: 'Half Day' },
          { dot: 'bg-red-500', label: 'Off Duty' },
          { dot: 'bg-slate-400', label: 'On Leave' },
        ].map(({ dot, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
            <span className="text-[11px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Active rotation chips */}
      {activeRotations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeRotations.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-[11px] text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/30 px-3 py-1.5 rounded-full">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-500" />
              <span className="font-semibold">{r.name}</span>
              <span className="text-violet-400">·</span>
              {r.cycle_days}-day cycle
            </div>
          ))}
        </div>
      )}

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
                    overrideByKey={overrideByKey}
                    leaveByKey={leaveByKey}
                    weekSlotMap={weekSlotMap}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground">
        Click any staff row to edit their schedule, overrides, and leave.
      </p>

      <StaffShiftDrawer
        staff={selectedStaff}
        open={!!selectedStaff}
        onClose={() => setSelectedStaff(null)}
      />
    </div>
  );
}
