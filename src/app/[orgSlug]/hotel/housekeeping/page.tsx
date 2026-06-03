'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import {
  useHousekeepingTasks,
  useCreateHousekeepingTask,
  useUpdateHousekeepingTask,
  useHotelRooms,
} from '@/hooks/useHotel';
import { usePermissions, P } from '@/hooks/usePermissions';
import type { CreateHousekeepingInput, HousekeepingTask } from '@/lib/api/hotel';
import { cn } from '@/lib/utils';
import { Loader2, Plus, Sparkles, X, CheckCircle2, PlayCircle, Ban } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const TASK_TYPES = [
  { value: 'routine_clean', label: 'Routine Clean' },
  { value: 'checkout_clean', label: 'Checkout Clean' },
  { value: 'deep_clean', label: 'Deep Clean' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'inspection', label: 'Inspection' },
];

const STATUS_OPTIONS = ['all', 'pending', 'in_progress', 'completed', 'cancelled'];

const STATUS_COLORS: Record<string, string> = {
  pending:     'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  in_progress: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  completed:   'bg-green-500/10 text-green-700 dark:text-green-400',
  cancelled:   'bg-muted text-muted-foreground',
};

function HousekeepingModal({ roomOptions, onClose }: { roomOptions: { id: string; label: string }[]; onClose: () => void }) {
  const [form, setForm] = useState<CreateHousekeepingInput>({
    room_id: roomOptions[0]?.id ?? '',
    task_type: 'routine_clean',
    priority: 'normal',
    notes: '',
  });
  const create = useCreateHousekeepingTask();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.room_id) { toast.error('Room is required'); return; }
    try {
      await create.mutateAsync(form);
      toast.success('Housekeeping task created');
      onClose();
    } catch {
      toast.error('Failed to create task');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md sm:rounded-2xl rounded-t-2xl bg-card border border-border shadow-2xl overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">New Housekeeping Task</h2>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Room *</span>
            <select
              value={form.room_id}
              onChange={(e) => setForm((f) => ({ ...f, room_id: e.target.value }))}
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {roomOptions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Task Type</span>
              <select
                value={form.task_type}
                onChange={(e) => setForm((f) => ({ ...f, task_type: e.target.value }))}
                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Priority</span>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</span>
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Optional instructions for the cleaner"
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={create.isPending} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HousekeepingPage() {
  const { can } = usePermissions();
  const canChange = can(P.HOTEL_CHANGE) || can(P.HOTEL_MANAGE);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [showModal, setShowModal] = useState(false);

  const { data: tasks = [], isLoading } = useHousekeepingTasks(filter ? { status: filter } : undefined);
  const { data: rooms = [] } = useHotelRooms();
  const update = useUpdateHousekeepingTask();

  const roomLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rooms) m.set(r.id, `Room ${r.room_number}`);
    return m;
  }, [rooms]);
  const roomOptions = useMemo(() => rooms.map((r) => ({ id: r.id, label: `Room ${r.room_number}` })), [rooms]);

  async function setStatus(task: HousekeepingTask, status: string) {
    try {
      await update.mutateAsync({ taskID: task.id, body: { status } });
      toast.success(`Task marked ${status.replace('_', ' ')}`);
    } catch {
      toast.error('Failed to update task');
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Housekeeping</h1>
          <p className="text-sm text-muted-foreground mt-1">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</p>
        </div>
        {canChange && (
          <button
            onClick={() => setShowModal(true)}
            disabled={roomOptions.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Task
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s === 'all' ? undefined : s)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium capitalize transition-colors',
              (s === 'all' ? !filter : filter === s) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <Sparkles className="h-12 w-12 opacity-30" />
          <p>No housekeeping tasks</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-border bg-card flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-foreground">{roomLabel.get(task.room_id) ?? 'Room'}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{task.task_type.replace('_', ' ')}</span>
                  {task.priority === 'urgent' && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 dark:text-red-400 font-medium">Urgent</span>}
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', STATUS_COLORS[task.status] ?? 'bg-muted text-muted-foreground')}>{task.status.replace('_', ' ')}</span>
                </div>
                {task.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{task.notes}</p>}
              </div>
              {canChange && task.status !== 'completed' && task.status !== 'cancelled' && (
                <div className="flex items-center gap-2">
                  {task.status === 'pending' && (
                    <button onClick={() => setStatus(task, 'in_progress')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors">
                      <PlayCircle className="h-3.5 w-3.5" /> Start
                    </button>
                  )}
                  <button onClick={() => setStatus(task, 'completed')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                  </button>
                  <button onClick={() => setStatus(task, 'cancelled')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-destructive/10 hover:text-destructive transition-colors">
                    <Ban className="h-3.5 w-3.5" /> Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && <HousekeepingModal roomOptions={roomOptions} onClose={() => setShowModal(false)} />}
    </div>
  );
}

export default function HousekeepingPageGated() {
  return (
    <ModuleGate moduleKey="hotel" fallback={<ModuleUnavailablePage moduleKey="hotel" />}>
      <HousekeepingPage />
    </ModuleGate>
  );
}
