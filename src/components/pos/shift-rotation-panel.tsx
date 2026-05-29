'use client';

import { useMemo, useState } from 'react';
import { Plus, Loader2, RotateCcw, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import {
  useShiftRotations, useShiftRotationDetail,
  useCreateShiftRotation, useUpdateShiftRotation,
} from '@/hooks/useShiftRotations';
import { useStaffAdmin } from '@/hooks/useStaff';
import { useAuthStore } from '@/store/auth';
import { Card, CardContent } from '@/components/ui/base';
import { toast } from 'sonner';
import type { ShiftRotation } from '@/lib/api/shift-rotations';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function RotationSlots({ rotationId, staffNames }: { rotationId: string; staffNames: Record<string, string> }) {
  const { data, isLoading } = useShiftRotationDetail(rotationId);

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>;
  }
  if (!data?.slots || data.slots.length === 0) {
    return <p className="text-xs text-muted-foreground py-3 text-center italic">No slots defined yet</p>;
  }

  const byStaff = data.slots.reduce<Record<string, typeof data.slots>>((acc, s) => {
    (acc[s.staff_member_id] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-2 mt-3 pt-3 border-t border-border">
      {Object.entries(byStaff).map(([staffId, slots]) => (
        <div key={staffId} className="flex items-start gap-2">
          <p className="text-xs font-medium w-28 shrink-0 pt-0.5 truncate">
            {staffNames[staffId] ?? staffId.slice(0, 8)}
          </p>
          <div className="flex flex-wrap gap-1">
            {slots.sort((a, b) => a.cycle_day - b.cycle_day).map((s) => (
              <span
                key={s.id}
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  s.is_off_day
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                }`}
              >
                D{s.cycle_day}{s.is_off_day ? ' Off' : ` ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RotationCard({ rotation, staffNames }: { rotation: ShiftRotation; staffNames: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const update = useUpdateShiftRotation(rotation.id);

  async function toggleActive() {
    try {
      await update.mutateAsync({ is_active: !rotation.is_active });
      toast.success(rotation.is_active ? 'Rotation deactivated' : 'Rotation activated');
    } catch {
      toast.error('Failed to update rotation');
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setExpanded((p) => !p)}
            className="flex items-center gap-2 min-w-0 flex-1 text-left"
          >
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{rotation.name}</p>
              <p className="text-xs text-muted-foreground">
                {rotation.cycle_days}-day cycle · starts {rotation.start_date.slice(0, 10)}
              </p>
            </div>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              rotation.is_active
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
            }`}>
              {rotation.is_active ? 'Active' : 'Inactive'}
            </span>
            <button
              onClick={toggleActive}
              disabled={update.isPending}
              title={rotation.is_active ? 'Deactivate' : 'Activate'}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        {expanded && <RotationSlots rotationId={rotation.id} staffNames={staffNames} />}
      </CardContent>
    </Card>
  );
}

export function ShiftRotationPanel() {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', cycle_days: '14', start_date: todayStr() });

  const { data: rotations = [], isLoading } = useShiftRotations();
  const { data: staffData } = useStaffAdmin(tenantId);
  const createRotation = useCreateShiftRotation();

  const staffNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of staffData?.data ?? []) { m[s.id] = s.name; }
    return m;
  }, [staffData]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      await createRotation.mutateAsync({
        name: form.name.trim(),
        cycle_days: parseInt(form.cycle_days) || 14,
        start_date: form.start_date,
      });
      toast.success('Rotation created');
      setForm({ name: '', cycle_days: '14', start_date: todayStr() });
      setShowCreate(false);
    } catch {
      toast.error('Failed to create rotation');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Rotations define recurring shift patterns over a cycle of days. Click a rotation to see its slots.
        </p>
        <button
          onClick={() => setShowCreate((p) => !p)}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors font-medium shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          New Rotation
        </button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleCreate} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New Rotation</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="text-xs font-medium">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Morning Rotation A"
                    required
                    className="w-full mt-1 px-3 py-2 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Cycle Length (days)</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={form.cycle_days}
                    onChange={(e) => setForm((f) => ({ ...f, cycle_days: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Start Date</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createRotation.isPending || !form.name.trim()}
                  className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {createRotation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="text-xs text-muted-foreground hover:text-foreground px-4 py-2 rounded-lg hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : rotations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <RefreshCw className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No rotations yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a rotation to assign recurring shift patterns to staff
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rotations.map((r) => (
            <RotationCard key={r.id} rotation={r} staffNames={staffNames} />
          ))}
        </div>
      )}
    </div>
  );
}
