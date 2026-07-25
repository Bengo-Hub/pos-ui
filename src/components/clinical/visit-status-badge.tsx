import { cn } from '@/lib/utils';
import type { VisitStatus } from '@/lib/api/clinical';

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  registered: 'Registered',
  triaged: 'Triaged',
  in_examination: 'In Examination',
  awaiting_lab: 'Awaiting Lab',
  lab_complete: 'Lab Complete',
  prescribed: 'Prescribed',
  dispensed: 'Dispensed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border',
        status === 'registered' && 'bg-yellow-500/10 text-yellow-700 border-yellow-400/30 dark:text-yellow-400',
        status === 'triaged' && 'bg-blue-500/10 text-blue-700 border-blue-400/30 dark:text-blue-400',
        status === 'in_examination' && 'bg-purple-500/10 text-purple-700 border-purple-400/30 dark:text-purple-400',
        status === 'awaiting_lab' && 'bg-orange-500/10 text-orange-700 border-orange-400/30 dark:text-orange-400',
        status === 'lab_complete' && 'bg-cyan-500/10 text-cyan-700 border-cyan-400/30 dark:text-cyan-400',
        status === 'prescribed' && 'bg-indigo-500/10 text-indigo-700 border-indigo-400/30 dark:text-indigo-400',
        status === 'dispensed' && 'bg-green-500/10 text-green-700 border-green-400/30 dark:text-green-400',
        status === 'completed' && 'bg-green-600/10 text-green-800 border-green-500/30 dark:text-green-400',
        status === 'cancelled' && 'bg-muted text-muted-foreground border-border',
      )}
    >
      {VISIT_STATUS_LABELS[status]}
    </span>
  );
}
