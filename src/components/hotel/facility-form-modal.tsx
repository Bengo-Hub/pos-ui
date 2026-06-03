'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateFacility, useUpdateFacility } from '@/hooks/useHotel';
import type { Facility, CreateFacilityInput } from '@/lib/api/hotel';

export const FACILITY_TYPES = [
  { value: 'conference', label: 'Conference Hall' },
  { value: 'pool', label: 'Swimming Pool' },
  { value: 'gym', label: 'Gym' },
  { value: 'spa', label: 'Spa' },
  { value: 'kids_area', label: 'Kids Area' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS = ['available', 'occupied', 'maintenance', 'closed'];
const inputCls = 'mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

/**
 * Shared create/edit modal for hotel Facilities. Used by the Facilities page and
 * by the Conference form's "+ Add venue" quick-create. On success, `onCreated`
 * receives the new/updated facility so callers can auto-select it.
 */
export function FacilityFormModal({
  facility,
  onClose,
  onCreated,
}: {
  facility?: Facility;
  onClose: () => void;
  onCreated?: (facility: Facility) => void;
}) {
  const isEdit = !!facility;
  const create = useCreateFacility();
  const update = useUpdateFacility(facility?.id ?? '');

  const [form, setForm] = useState<CreateFacilityInput & { status?: string }>({
    name: facility?.name ?? '',
    facility_type: facility?.facility_type ?? 'conference',
    capacity: facility?.capacity ?? 50,
    rate_per_session: facility?.rate_per_session ?? 0,
    currency: facility?.currency ?? 'KES',
    opening_time: facility?.opening_time ?? '08:00',
    closing_time: facility?.closing_time ?? '18:00',
    status: facility?.status ?? 'available',
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Facility name is required'); return; }
    try {
      const saved = isEdit ? await update.mutateAsync(form) : await create.mutateAsync(form);
      toast.success(isEdit ? 'Facility updated' : 'Facility created');
      onCreated?.(saved as Facility);
      onClose();
    } catch {
      toast.error(isEdit ? 'Failed to update facility' : 'Failed to create facility');
    }
  }

  const isPending = create.isPending || update.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-bold text-foreground">{isEdit ? 'Edit Facility' : 'Add Facility'}</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted hover:bg-destructive/10 hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name *</span>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Grand Ballroom" className={inputCls} />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</span>
              <select value={form.facility_type} onChange={(e) => set('facility_type', e.target.value)} className={inputCls}>
                {FACILITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Capacity</span>
              <input type="number" min={1} value={form.capacity} onChange={(e) => set('capacity', parseInt(e.target.value) || 0)} className={inputCls} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rate / Session</span>
              <input type="number" min={0} step={0.01} value={form.rate_per_session} onChange={(e) => set('rate_per_session', parseFloat(e.target.value) || 0)} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currency</span>
              <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={inputCls}>
                {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Opens</span>
              <input type="time" value={form.opening_time} onChange={(e) => set('opening_time', e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Closes</span>
              <input type="time" value={form.closing_time} onChange={(e) => set('closing_time', e.target.value)} className={inputCls} />
            </label>
          </div>

          {isEdit && (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </label>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
            <button type="submit" disabled={isPending} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : isEdit ? 'Save Changes' : 'Add Facility'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
