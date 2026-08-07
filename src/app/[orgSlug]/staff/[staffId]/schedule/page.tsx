'use client';

import {
  useStaffSchedule,
  useUpsertStaffSchedule,
  DAY_NAMES,
  type StaffScheduleEntry,
  type UpsertScheduleEntry,
} from '@/hooks/useStaffSchedule';
import { Loader2, Save } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { buildScheduleColumns, type DayRow } from './schedule-columns';

const DEFAULT_ROWS: DayRow[] = DAY_NAMES.map((_, i) => ({
  day: i,
  startTime: '08:00',
  endTime: '17:00',
  isAvailable: i > 0 && i < 6,
}));

function mergWithSchedule(rows: DayRow[], schedule: StaffScheduleEntry[]): DayRow[] {
  return rows.map((row) => {
    const entry = schedule.find((e) => e.day_of_week === row.day);
    if (!entry) return row;
    return {
      day: row.day,
      startTime: entry.start_time,
      endTime: entry.end_time,
      isAvailable: entry.is_available,
    };
  });
}

export default function StaffSchedulePage() {
  const params = useParams();
  const staffId = params?.staffId as string;

  const { data: schedule, isLoading } = useStaffSchedule(staffId);
  const upsert = useUpsertStaffSchedule(staffId);

  const [rows, setRows] = useState<DayRow[]>(DEFAULT_ROWS);

  useEffect(() => {
    if (schedule) {
      setRows(mergWithSchedule(DEFAULT_ROWS, schedule));
    }
  }, [schedule]);

  function updateRow(day: number, patch: Partial<DayRow>) {
    setRows((prev) => prev.map((r) => (r.day === day ? { ...r, ...patch } : r)));
  }
  const columns = useMemo(() => buildScheduleColumns({ onUpdate: updateRow }), []);

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
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to save schedule'));
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading schedule…</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Weekly Schedule</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Set recurring availability for staff member
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={upsert.isPending}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {upsert.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Schedule
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.day)}
        rowClassName={(row) => (!row.isAvailable ? 'opacity-50' : undefined)}
        storageKey="staff-schedule-col-prefs"
      />
    </div>
  );
}
