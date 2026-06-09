'use client';

import { REPAIR_STATUS_LABELS, type RepairStatus } from '@/hooks/useRepairs';

const STATUS_CLASSES: Record<RepairStatus, string> = {
  intake: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  diagnosed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  awaiting_parts: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  in_progress: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400',
  ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400',
};

export function RepairStatusBadge({ status }: { status: RepairStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${STATUS_CLASSES[status]}`}>
      {REPAIR_STATUS_LABELS[status]}
    </span>
  );
}
