'use client';

import { useMemo, useState } from 'react';
import { Plus, Loader2, RotateCcw, ChevronDown, ChevronRight, RefreshCw, Trash2, Users } from 'lucide-react';
import {
  useShiftRotations, useShiftRotationDetail,
  useCreateShiftRotation, useUpdateShiftRotation, useUpsertRotationSlots,
} from '@/hooks/useShiftRotations';
import { useStaffAdmin, useStaffSearch } from '@/hooks/useStaff';
import { useAuthStore } from '@/store/auth';
import { Card, CardContent } from '@/components/ui/base';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { ShiftRotation, ShiftRotationSlot } from '@/lib/api/shift-rotations';
import { SearchableCombobox } from '@bengo-hub/shared-ui-lib/combobox';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const inputCls = 'w-full mt-1 px-3 py-2 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring';

/* ── Slot Manager ── */

interface SlotManagerProps {
  rotation: ShiftRotation;
  staffNames: Record<string, string>;
  staffIds: string[];
}

function SlotManager({ rotation, staffNames, staffIds }: SlotManagerProps) {
  const { data, isLoading } = useShiftRotationDetail(rotation.id);
  const upsert = useUpsertRotationSlots(rotation.id);
  const tenantId = useAuthStore((s) => s.user?.tenant_id) ?? '';
  const searchStaff = useStaffSearch(tenantId);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    staff_member_id: '',
    day_from: '1',
    day_to: String(rotation.cycle_days),
    is_off_day: false,
    start_time: '08:00',
    end_time: '17:00',
  });

  const slots = data?.slots ?? [];

  // Group existing slots by staff for display
  const byStaff = useMemo(() => {
    return slots.reduce<Record<string, ShiftRotationSlot[]>>((acc, s) => {
      (acc[s.staff_member_id] ??= []).push(s);
      return acc;
    }, {});
  }, [slots]);

  async function deleteSlot(slotId: string) {
    const remaining = slots
      .filter((s) => s.id !== slotId)
      .map((s) => ({
        staff_member_id: s.staff_member_id,
        cycle_day: s.cycle_day,
        start_time: s.start_time,
        end_time: s.end_time,
        is_off_day: s.is_off_day,
      }));
    try {
      await upsert.mutateAsync(remaining);
      toast.success('Slot removed');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to remove slot'));
    }
  }

  async function handleAddSlots(e: React.FormEvent) {
    e.preventDefault();
    if (!form.staff_member_id) { toast.error('Select a staff member'); return; }
    const from = parseInt(form.day_from);
    const to = parseInt(form.day_to);
    if (isNaN(from) || isNaN(to) || from < 1 || to > rotation.cycle_days || from > to) {
      toast.error(`Day range must be 1–${rotation.cycle_days}`);
      return;
    }

    // New slots for the range
    const newSlots = Array.from({ length: to - from + 1 }, (_, i) => ({
      staff_member_id: form.staff_member_id,
      cycle_day: from + i,
      start_time: form.is_off_day ? '00:00' : form.start_time,
      end_time: form.is_off_day ? '00:00' : form.end_time,
      is_off_day: form.is_off_day,
    }));

    // Keep existing slots that don't overlap the new range for this staff member
    const existing = slots
      .filter((s) => !(s.staff_member_id === form.staff_member_id && s.cycle_day >= from && s.cycle_day <= to))
      .map((s) => ({
        staff_member_id: s.staff_member_id,
        cycle_day: s.cycle_day,
        start_time: s.start_time,
        end_time: s.end_time,
        is_off_day: s.is_off_day,
      }));

    try {
      await upsert.mutateAsync([...existing, ...newSlots]);
      toast.success(`Assigned ${newSlots.length} slot${newSlots.length !== 1 ? 's' : ''}`);
      setShowForm(false);
      setForm((f) => ({ ...f, staff_member_id: '', day_from: '1', day_to: String(rotation.cycle_days) }));
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to save slots'));
    }
  }

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>;
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3">
      {/* Existing staff assignments */}
      {Object.keys(byStaff).length === 0 ? (
        <p className="text-xs text-muted-foreground py-2 text-center italic">
          No staff assigned yet — add staff schedules below
        </p>
      ) : (
        <div className="space-y-2">
          {Object.entries(byStaff).map(([staffId, staffSlots]) => (
            <div key={staffId} className="flex items-start gap-2">
              <p className="text-xs font-medium w-28 shrink-0 pt-0.5 truncate">
                {staffNames[staffId] ?? staffId.slice(0, 8)}
              </p>
              <div className="flex flex-wrap gap-1 flex-1">
                {staffSlots.sort((a, b) => a.cycle_day - b.cycle_day).map((s) => (
                  <span
                    key={s.id}
                    className={`group inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      s.is_off_day
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                    }`}
                  >
                    D{s.cycle_day}{s.is_off_day ? ' Off' : ` ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`}
                    <button
                      onClick={() => deleteSlot(s.id)}
                      disabled={upsert.isPending}
                      className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add slots form */}
      {showForm ? (
        <form onSubmit={handleAddSlots} className="rounded-xl border border-border bg-accent/10 p-3 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Assign Staff Schedule</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-[10px] font-medium text-muted-foreground">Staff Member</label>
              <div className="relative">
                <SearchableCombobox
                  options={staffIds.map((id) => ({ value: id, label: staffNames[id] ?? id.slice(0, 8) }))}
                  value={form.staff_member_id}
                  onChange={(id) => setForm((f) => ({ ...f, staff_member_id: id }))}
                  placeholder="— select staff —"
                  onRemoteSearch={searchStaff}
                />
                {/* Participates in native form validation the way the old <select required> did. */}
                <input
                  tabIndex={-1}
                  aria-hidden
                  required
                  value={form.staff_member_id}
                  onChange={() => {}}
                  className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">From Day</label>
              <input type="number" min={1} max={rotation.cycle_days} value={form.day_from}
                onChange={(e) => setForm((f) => ({ ...f, day_from: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">To Day</label>
              <input type="number" min={1} max={rotation.cycle_days} value={form.day_to}
                onChange={(e) => setForm((f) => ({ ...f, day_to: e.target.value }))}
                className={inputCls} />
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
              <span className="text-xs font-medium">Off Day</span>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, is_off_day: !f.is_off_day }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.is_off_day ? 'bg-red-500' : 'bg-muted'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${form.is_off_day ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {!form.is_off_day && (
              <>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Start Time</label>
                  <input type="time" value={form.start_time}
                    onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">End Time</label>
                  <input type="time" value={form.end_time}
                    onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                    className={inputCls} />
                </div>
              </>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Assigns {form.is_off_day ? 'off-day' : `${form.start_time}–${form.end_time} work`} slots to{' '}
            {form.day_from === form.day_to ? `day ${form.day_from}` : `days ${form.day_from}–${form.day_to}`} of the cycle
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={upsert.isPending || !form.staff_member_id}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {upsert.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Assign
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-accent transition-colors">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <Users className="h-3.5 w-3.5" />
          Assign Staff Schedule
        </button>
      )}
    </div>
  );
}

/* ── Rotation Card ── */

function RotationCard({
  rotation, staffNames, staffIds,
}: {
  rotation: ShiftRotation;
  staffNames: Record<string, string>;
  staffIds: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const update = useUpdateShiftRotation(rotation.id);

  async function toggleActive() {
    try {
      await update.mutateAsync({ is_active: !rotation.is_active });
      toast.success(rotation.is_active ? 'Rotation deactivated' : 'Rotation activated');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to update rotation'));
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
        {expanded && (
          <SlotManager rotation={rotation} staffNames={staffNames} staffIds={staffIds} />
        )}
      </CardContent>
    </Card>
  );
}

/* ── Panel ── */

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

  const staffIds = useMemo(() => (staffData?.data ?? []).map((s) => s.id), [staffData]);

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
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to create rotation'));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">
            Rotations define recurring shift patterns over a cycle of days.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Expand a rotation → <strong>Assign Staff Schedule</strong> → pick staff, day range, and hours.
            The Planner tab shows assigned slots as violet dots.
          </p>
        </div>
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
                  <input type="text" value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Morning Rotation A"
                    required
                    className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium">Cycle Length (days)</label>
                  <input type="number" min="1" max="365" value={form.cycle_days}
                    onChange={(e) => setForm((f) => ({ ...f, cycle_days: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium">Start Date</label>
                  <input type="date" value={form.start_date}
                    onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                    className={inputCls} />
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
                <button type="button" onClick={() => setShowCreate(false)}
                  className="text-xs text-muted-foreground hover:text-foreground px-4 py-2 rounded-lg hover:bg-accent transition-colors">
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
            <RotationCard key={r.id} rotation={r} staffNames={staffNames} staffIds={staffIds} />
          ))}
        </div>
      )}
    </div>
  );
}
