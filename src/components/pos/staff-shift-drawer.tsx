'use client';

import { useEffect, useState } from 'react';
import { X, Save, Loader2, Plus, Trash2, CalendarOff, CalendarClock } from 'lucide-react';
import {
  useStaffSchedule,
  useUpsertStaffSchedule,
  DAY_NAMES,
  type StaffScheduleEntry,
  type UpsertScheduleEntry,
} from '@/hooks/useStaffSchedule';
import { useStaffOverrides, useCreateShiftOverride, useDeleteShiftOverride } from '@/hooks/useShiftOverrides';
import { useStaffLeaveRequests, useCreateLeaveRequest } from '@/hooks/useLeaveRequests';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import type { StaffMember } from '@/lib/api/staff';
import type { OverrideType } from '@/lib/api/shift-overrides';
import type { LeaveType } from '@/lib/api/leave-requests';
import { toast } from 'sonner';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', cashier: 'Cashier', waiter: 'Waiter',
  kitchen: 'Kitchen', bar: 'Bar', receptionist: 'Reception',
  pharmacist: 'Pharmacist', stylist: 'Stylist', therapist: 'Therapist', technician: 'Technician',
};

const OVERRIDE_TYPE_LABELS: Record<OverrideType, string> = {
  off_duty: 'Off Duty',
  manual_shift: 'Custom Shift',
  half_day: 'Half Day',
};

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: 'Annual Leave',
  sick: 'Sick Leave',
  unpaid: 'Unpaid Leave',
  maternity: 'Maternity / Paternity',
  compassionate: 'Compassionate',
  other: 'Other',
};

const LEAVE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  approved: 'bg-green-500/10 text-green-700 dark:text-green-400',
  rejected: 'bg-red-500/10 text-red-700 dark:text-red-400',
};

interface DayRow {
  day: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

const DEFAULT_ROWS: DayRow[] = DAY_NAMES.map((_, i) => ({
  day: i,
  startTime: '08:00',
  endTime: '17:00',
  isAvailable: i > 0 && i < 6,
}));

function mergeWithSchedule(rows: DayRow[], schedule: StaffScheduleEntry[]): DayRow[] {
  return rows.map((row) => {
    const entry = schedule.find((e) => e.day_of_week === row.day);
    if (!entry) return row;
    return { day: row.day, startTime: entry.start_time, endTime: entry.end_time, isAvailable: entry.is_available };
  });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

type Tab = 'schedule' | 'overrides' | 'leave';

export interface StaffShiftDrawerProps {
  staff: StaffMember | null;
  open: boolean;
  onClose: () => void;
}

export function StaffShiftDrawer({ staff, open, onClose }: StaffShiftDrawerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('schedule');
  const outletId = useAuthStore((s) => s.outlet?.id ?? '');

  // ── Weekly schedule tab ──────────────────────────────────────────────────
  const { data: schedule, isLoading: schedLoading } = useStaffSchedule(staff?.id ?? '');
  const upsert = useUpsertStaffSchedule(staff?.id ?? '');
  const [rows, setRows] = useState<DayRow[]>(DEFAULT_ROWS);

  useEffect(() => {
    if (schedule) setRows(mergeWithSchedule(DEFAULT_ROWS, schedule));
    else setRows(DEFAULT_ROWS);
  }, [schedule, staff?.id]);

  function updateRow(day: number, patch: Partial<DayRow>) {
    setRows((prev) => prev.map((r) => (r.day === day ? { ...r, ...patch } : r)));
  }

  async function handleSaveSchedule() {
    const entries: UpsertScheduleEntry[] = rows.map((r) => ({
      outlet_id: outletId || undefined,
      day_of_week: r.day,
      start_time: r.startTime,
      end_time: r.endTime,
      is_available: r.isAvailable,
    }));
    try {
      await upsert.mutateAsync(entries);
      toast.success('Schedule saved');
    } catch {
      toast.error('Failed to save schedule');
    }
  }

  // ── Overrides tab ────────────────────────────────────────────────────────
  const weekFrom = todayStr();
  const weekTo = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10); // 90 days ahead
  const { data: overrides = [], isLoading: ovLoading } = useStaffOverrides(staff?.id ?? '', weekFrom, weekTo);
  const createOverride = useCreateShiftOverride(staff?.id ?? '');
  const deleteOverride = useDeleteShiftOverride(staff?.id ?? '');

  const [ovForm, setOvForm] = useState({ date: todayStr(), override_type: 'off_duty' as OverrideType, start_time: '08:00', end_time: '12:00', reason: '' });

  async function handleCreateOverride() {
    try {
      await createOverride.mutateAsync({
        date: ovForm.date,
        override_type: ovForm.override_type,
        start_time: ovForm.override_type !== 'off_duty' ? ovForm.start_time : undefined,
        end_time: ovForm.override_type !== 'off_duty' ? ovForm.end_time : undefined,
        reason: ovForm.reason || undefined,
      });
      toast.success('Override saved');
      setOvForm({ date: todayStr(), override_type: 'off_duty', start_time: '08:00', end_time: '12:00', reason: '' });
    } catch {
      toast.error('Failed to save override');
    }
  }

  // ── Leave requests tab ───────────────────────────────────────────────────
  const { data: leaveRequests = [], isLoading: lvLoading } = useStaffLeaveRequests(staff?.id ?? '');
  const createLeave = useCreateLeaveRequest(staff?.id ?? '');

  const [lvForm, setLvForm] = useState({ start_date: todayStr(), end_date: todayStr(), leave_type: 'annual' as LeaveType, reason: '' });

  async function handleCreateLeave() {
    try {
      await createLeave.mutateAsync({
        start_date: lvForm.start_date,
        end_date: lvForm.end_date,
        leave_type: lvForm.leave_type,
        reason: lvForm.reason || undefined,
      });
      toast.success('Leave request submitted');
      setLvForm({ start_date: todayStr(), end_date: todayStr(), leave_type: 'annual', reason: '' });
    } catch {
      toast.error('Failed to submit leave request');
    }
  }

  if (!open) return null;

  const initials = staff?.name
    ? staff.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'schedule', label: 'Schedule' },
    { id: 'overrides', label: 'Overrides' },
    { id: 'leave', label: 'Leave' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md bg-background shadow-2xl flex flex-col border-l border-border">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{staff?.name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[staff?.role ?? ''] ?? staff?.role}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'flex-1 py-2.5 text-xs font-semibold transition-colors',
                activeTab === t.id
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── Schedule tab ──────────────────────────────────────────────── */}
          {activeTab === 'schedule' && (
            <>
              <div>
                <h3 className="text-sm font-bold">Weekly Schedule</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Recurring availability and working hours.</p>
              </div>

              {schedLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-accent/20 border-b border-border">
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground w-14">Day</th>
                        <th className="text-left px-2 py-2.5 text-xs font-semibold text-muted-foreground">Start</th>
                        <th className="text-left px-2 py-2.5 text-xs font-semibold text-muted-foreground">End</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground w-14">On</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((row) => (
                        <tr key={row.day} className={cn('transition-colors', !row.isAvailable && 'opacity-40 bg-muted/20')}>
                          <td className="px-3 py-2.5 font-medium text-xs">{DAY_SHORT[row.day]}</td>
                          <td className="px-2 py-2.5">
                            <input
                              type="time"
                              value={row.startTime}
                              onChange={(e) => updateRow(row.day, { startTime: e.target.value })}
                              disabled={!row.isAvailable}
                              className="rounded-md border border-border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40 w-[90px]"
                            />
                          </td>
                          <td className="px-2 py-2.5">
                            <input
                              type="time"
                              value={row.endTime}
                              onChange={(e) => updateRow(row.day, { endTime: e.target.value })}
                              disabled={!row.isAvailable}
                              className="rounded-md border border-border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40 w-[90px]"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => updateRow(row.day, { isAvailable: !row.isAvailable })}
                              className={cn(
                                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                                row.isAvailable ? 'bg-primary' : 'bg-muted',
                              )}
                            >
                              <span className={cn(
                                'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                                row.isAvailable ? 'translate-x-5' : 'translate-x-0.5',
                              )} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Overrides tab ─────────────────────────────────────────────── */}
          {activeTab === 'overrides' && (
            <>
              <div>
                <h3 className="text-sm font-bold">Date Overrides</h3>
                <p className="text-xs text-muted-foreground mt-0.5">One-off exceptions to the recurring schedule.</p>
              </div>

              {/* Add override form */}
              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Override</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block col-span-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Date</span>
                    <input
                      type="date"
                      value={ovForm.date}
                      onChange={(e) => setOvForm((f) => ({ ...f, date: e.target.value }))}
                      className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                  <label className="block col-span-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Type</span>
                    <select
                      value={ovForm.override_type}
                      onChange={(e) => setOvForm((f) => ({ ...f, override_type: e.target.value as OverrideType }))}
                      className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {(Object.keys(OVERRIDE_TYPE_LABELS) as OverrideType[]).map((k) => (
                        <option key={k} value={k}>{OVERRIDE_TYPE_LABELS[k]}</option>
                      ))}
                    </select>
                  </label>
                  {ovForm.override_type !== 'off_duty' && (
                    <>
                      <label className="block">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Start</span>
                        <input type="time" value={ovForm.start_time} onChange={(e) => setOvForm((f) => ({ ...f, start_time: e.target.value }))}
                          className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">End</span>
                        <input type="time" value={ovForm.end_time} onChange={(e) => setOvForm((f) => ({ ...f, end_time: e.target.value }))}
                          className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </label>
                    </>
                  )}
                  <label className="block col-span-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Reason (optional)</span>
                    <input
                      type="text"
                      placeholder="e.g. Medical appointment"
                      value={ovForm.reason}
                      onChange={(e) => setOvForm((f) => ({ ...f, reason: e.target.value }))}
                      className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                </div>
                <button
                  onClick={handleCreateOverride}
                  disabled={createOverride.isPending || !ovForm.date}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-lg text-xs font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {createOverride.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Add Override
                </button>
              </div>

              {/* Override list */}
              {ovLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-xs py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading overrides…
                </div>
              ) : overrides.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <CalendarOff className="h-8 w-8 opacity-20" />
                  <p className="text-xs">No upcoming overrides</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {overrides.map((ov) => (
                    <div key={ov.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold">{new Date(ov.date).toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                        <p className="text-[10px] text-muted-foreground">{OVERRIDE_TYPE_LABELS[ov.override_type]}{ov.start_time ? ` · ${ov.start_time}–${ov.end_time}` : ''}</p>
                        {ov.reason && <p className="text-[10px] text-muted-foreground italic truncate">{ov.reason}</p>}
                      </div>
                      <button
                        onClick={() => deleteOverride.mutate(ov.id, { onError: () => toast.error('Failed to delete') })}
                        disabled={deleteOverride.isPending}
                        className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Leave requests tab ────────────────────────────────────────── */}
          {activeTab === 'leave' && (
            <>
              <div>
                <h3 className="text-sm font-bold">Leave Requests</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Approved by a manager. Shown in the shift planner.</p>
              </div>

              {/* Add leave form */}
              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Request</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">From</span>
                    <input type="date" value={lvForm.start_date} onChange={(e) => setLvForm((f) => ({ ...f, start_date: e.target.value }))}
                      className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">To</span>
                    <input type="date" value={lvForm.end_date} min={lvForm.start_date} onChange={(e) => setLvForm((f) => ({ ...f, end_date: e.target.value }))}
                      className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                  <label className="block col-span-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Type</span>
                    <select value={lvForm.leave_type} onChange={(e) => setLvForm((f) => ({ ...f, leave_type: e.target.value as LeaveType }))}
                      className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {(Object.keys(LEAVE_TYPE_LABELS) as LeaveType[]).map((k) => (
                        <option key={k} value={k}>{LEAVE_TYPE_LABELS[k]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block col-span-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Reason (optional)</span>
                    <input type="text" placeholder="e.g. Family event" value={lvForm.reason} onChange={(e) => setLvForm((f) => ({ ...f, reason: e.target.value }))}
                      className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                </div>
                <button
                  onClick={handleCreateLeave}
                  disabled={createLeave.isPending || !lvForm.start_date || !lvForm.end_date}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-lg text-xs font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {createLeave.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Submit Request
                </button>
              </div>

              {/* Leave list */}
              {lvLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-xs py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : leaveRequests.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <CalendarClock className="h-8 w-8 opacity-20" />
                  <p className="text-xs">No leave requests</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {leaveRequests.map((lv) => {
                    const start = new Date(lv.start_date);
                    const end = new Date(lv.end_date);
                    const days = Math.round((end.getTime() - start.getTime()) / 86400_000) + 1;
                    return (
                      <div key={lv.id} className="rounded-xl border border-border bg-card px-3 py-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold">
                            {start.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })}
                            {' – '}
                            {end.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })}
                            <span className="text-muted-foreground font-normal ml-1">({days}d)</span>
                          </p>
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold capitalize', LEAVE_STATUS_COLORS[lv.status])}>
                            {lv.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{LEAVE_TYPE_LABELS[lv.leave_type]}</p>
                        {lv.rejection_reason && (
                          <p className="text-[10px] text-destructive italic">Reason: {lv.rejection_reason}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer — only shown on schedule tab */}
        {activeTab === 'schedule' && (
          <div className="px-5 py-4 border-t border-border shrink-0">
            <button
              onClick={handleSaveSchedule}
              disabled={upsert.isPending || schedLoading}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Schedule
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
