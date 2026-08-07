'use client';

// DataTable column definitions for a staff member's Weekly Schedule editor — split out of
// page.tsx to mirror the platform's <page>-columns.tsx convention. Each row is one day of the
// week; the Start/End/Available cells are inline-editable, writing straight back through
// `onUpdate` into the page's local `rows` state (the whole week is saved together via the
// page's single "Save Schedule" button — there is no per-row persistence here).

import { cn } from '@/lib/utils';
import { DAY_NAMES } from '@/hooks/useStaffSchedule';
import type { DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';

export interface DayRow {
  day: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export interface ScheduleColumnCallbacks {
  onUpdate: (day: number, patch: Partial<DayRow>) => void;
}

export function buildScheduleColumns(cb: ScheduleColumnCallbacks): DataTableColumn<DayRow>[] {
  return [
    {
      key: 'day',
      header: 'Day',
      primary: true,
      accessor: (row) => DAY_NAMES[row.day],
      render: (row) => <span className="font-medium">{DAY_NAMES[row.day]}</span>,
    },
    {
      key: 'startTime',
      header: 'Start',
      render: (row) => (
        <input
          type="time"
          value={row.startTime}
          onChange={(e) => cb.onUpdate(row.day, { startTime: e.target.value })}
          disabled={!row.isAvailable}
          className="rounded-lg border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
        />
      ),
    },
    {
      key: 'endTime',
      header: 'End',
      render: (row) => (
        <input
          type="time"
          value={row.endTime}
          onChange={(e) => cb.onUpdate(row.day, { endTime: e.target.value })}
          disabled={!row.isAvailable}
          className="rounded-lg border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
        />
      ),
    },
    {
      key: 'isAvailable',
      header: 'Available',
      mobileAction: true,
      accessor: (row) => row.isAvailable,
      render: (row) => (
        <button
          type="button"
          role="switch"
          aria-checked={row.isAvailable}
          onClick={() => cb.onUpdate(row.day, { isAvailable: !row.isAvailable })}
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
            row.isAvailable ? 'bg-primary' : 'bg-muted',
          )}
        >
          <span
            className={cn(
              'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
              row.isAvailable ? 'translate-x-5' : 'translate-x-0.5',
            )}
          />
        </button>
      ),
    },
  ];
}
