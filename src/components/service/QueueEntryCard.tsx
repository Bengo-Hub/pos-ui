'use client';

import { Clock, Phone, User, ChevronRight } from 'lucide-react';
import type { QueueEntry, QueueStatus } from '@/lib/api/queue';

interface QueueEntryCardProps {
  entry: QueueEntry;
  onStatusChange: (entryID: string, status: QueueStatus) => void;
  loading?: boolean;
}

const STATUS_NEXT: Record<string, QueueStatus | null> = {
  waiting: 'in_progress',
  in_progress: 'done',
  done: null,
  cancelled: null,
};

const STATUS_NEXT_LABEL: Record<string, string> = {
  waiting: 'Start',
  in_progress: 'Complete',
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

export function QueueEntryCard({ entry, onStatusChange, loading }: QueueEntryCardProps) {
  const next = STATUS_NEXT[entry.status];
  const nextLabel = STATUS_NEXT_LABEL[entry.status];

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-bold text-primary">
            {entry.queue_position}
          </span>
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{entry.customer_name}</p>
            {entry.service_name && (
              <p className="text-xs text-muted-foreground truncate">{entry.service_name}</p>
            )}
          </div>
        </div>
        {next && (
          <button
            type="button"
            onClick={() => onStatusChange(entry.id, next)}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shrink-0 hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {nextLabel}
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {entry.customer_phone && (
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {entry.customer_phone}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo(entry.created_at)}
        </span>
        {entry.staff_member_id && (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            Assigned
          </span>
        )}
      </div>

      {entry.notes && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-2.5 py-1.5">{entry.notes}</p>
      )}

      <button
        type="button"
        onClick={() => onStatusChange(entry.id, 'cancelled')}
        disabled={loading}
        className="w-full text-xs text-destructive/60 hover:text-destructive transition-colors py-0.5"
      >
        Cancel
      </button>
    </div>
  );
}
