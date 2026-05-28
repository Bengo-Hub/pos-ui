'use client';

import { useEffect, useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import {
  useStaffSchedule,
  useUpsertStaffSchedule,
  DAY_NAMES,
  type StaffScheduleEntry,
  type UpsertScheduleEntry,
} from '@/hooks/useStaffSchedule';
import { cn } from '@/lib/utils';
import type { StaffMember } from '@/lib/api/staff';
import { toast } from 'sonner';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', cashier: 'Cashier', waiter: 'Waiter',
  kitchen: 'Kitchen', bar: 'Bar', receptionist: 'Reception',
  pharmacist: 'Pharmacist', stylist: 'Stylist', therapist: 'Therapist', technician: 'Technician',
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

export interface StaffShiftDrawerProps {
  staff: StaffMember | null;
  open: boolean;
  onClose: () => void;
}

export function StaffShiftDrawer({ staff, open, onClose }: StaffShiftDrawerProps) {
  const { data: schedule, isLoading } = useStaffSchedule(staff?.id ?? '');
  const upsert = useUpsertStaffSchedule(staff?.id ?? '');
  const [rows, setRows] = useState<DayRow[]>(DEFAULT_ROWS);

  useEffect(() => {
    if (schedule) {
      setRows(mergeWithSchedule(DEFAULT_ROWS, schedule));
    } else {
      setRows(DEFAULT_ROWS);
    }
  }, [schedule, staff?.id]);

  function updateRow(day: number, patch: Partial<DayRow>) {
    setRows((prev) => prev.map((r) => (r.day === day ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    const entries: UpsertScheduleEntry[] = rows.map((r) => ({
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

  if (!open) return null;

  const initials = staff?.name
    ? staff.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
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
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold">Weekly Schedule</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Set recurring availability and working hours.</p>
          </div>

          {isLoading ? (
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
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border shrink-0">
          <button
            onClick={handleSave}
            disabled={upsert.isPending || isLoading}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {upsert.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Save className="h-4 w-4" />
            }
            Save Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
