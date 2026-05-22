'use client';

import { Users } from 'lucide-react';
import type { QueueEntry, QueueStatus } from '@/lib/api/queue';
import { QueueEntryCard } from './QueueEntryCard';

interface Column {
  status: QueueStatus;
  label: string;
  color: string;
}

const COLUMNS: Column[] = [
  { status: 'waiting', label: 'Waiting', color: 'text-amber-600' },
  { status: 'in_progress', label: 'In Progress', color: 'text-blue-600' },
  { status: 'done', label: 'Done', color: 'text-green-600' },
];

interface QueueBoardProps {
  entries: QueueEntry[];
  onStatusChange: (entryID: string, status: QueueStatus) => void;
  loading?: boolean;
}

export function QueueBoard({ entries, onStatusChange, loading }: QueueBoardProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 h-full">
      {COLUMNS.map((col) => {
        const colEntries = entries.filter((e) => e.status === col.status);
        return (
          <div key={col.status} className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className={`text-sm font-bold ${col.color}`}>{col.label}</h3>
              <span className="text-xs bg-muted rounded-full px-2 py-0.5 font-semibold">
                {colEntries.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pb-4">
              {colEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/40">
                  <Users className="h-8 w-8 mb-2" />
                  <p className="text-xs">Empty</p>
                </div>
              ) : (
                colEntries.map((entry) => (
                  <QueueEntryCard
                    key={entry.id}
                    entry={entry}
                    onStatusChange={onStatusChange}
                    loading={loading}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
