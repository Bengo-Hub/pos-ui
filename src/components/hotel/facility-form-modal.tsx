'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateFacility, useUpdateFacility, useInventoryServiceItems } from '@/hooks/useHotel';
import { apiErrorMessage } from '@/lib/api/error-message';
import { SUPPORTED_CURRENCIES } from '@/lib/utils';
import type { Facility, CreateFacilityInput } from '@/lib/api/hotel';

export const FACILITY_TYPES = [
  { value: 'coworking', label: 'Co-working Space' },
  { value: 'conference', label: 'Conference Hall' },
  { value: 'pool', label: 'Swimming Pool' },
  { value: 'gym', label: 'Gym' },
  { value: 'spa', label: 'Spa' },
  { value: 'kids_area', label: 'Kids Area' },
  { value: 'other', label: 'Other' },
];

// Facility types that default to shared (co-working style) capacity rather than an
// exclusive whole-space hold — the admin can still flip the toggle either way.
const SHARED_BY_DEFAULT = new Set(['coworking']);

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
  // Bookable-space rate masters: HOSPITALITY_FACILITY (co-working desks) + CONFERENCE
  // (meeting/conference rooms) — either can be linked as this facility's authoritative
  // inventory package, so the terminal price and this booking flow never drift apart.
  const { data: facilityItems = [] } = useInventoryServiceItems('HOSPITALITY_FACILITY');
  const { data: conferenceItems = [] } = useInventoryServiceItems('CONFERENCE');
  const inventoryOptions = [...facilityItems, ...conferenceItems];

  const [form, setForm] = useState<CreateFacilityInput & { status?: string }>({
    name: facility?.name ?? '',
    facility_type: facility?.facility_type ?? 'conference',
    capacity: facility?.capacity ?? 50,
    rate_per_session: facility?.rate_per_session ?? 0,
    currency: facility?.currency ?? 'KES',
    opening_time: facility?.opening_time ?? '08:00',
    closing_time: facility?.closing_time ?? '18:00',
    status: facility?.status ?? 'available',
    booking_mode: facility?.booking_mode ?? 'exclusive',
    inventory_item_id: facility?.inventory_item_id ?? undefined,
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
    } catch (e) {
      toast.error(await apiErrorMessage(e, isEdit ? 'Failed to update facility' : 'Failed to create facility'));
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
              <select
                value={form.facility_type}
                onChange={(e) => {
                  const type = e.target.value;
                  set('facility_type', type);
                  // Only auto-default booking_mode when creating — never clobber an admin's
                  // explicit choice on an existing facility.
                  if (!isEdit) set('booking_mode', SHARED_BY_DEFAULT.has(type) ? 'shared' : 'exclusive');
                }}
                className={inputCls}
              >
                {FACILITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Capacity {form.booking_mode === 'shared' ? '(seats)' : '(guests)'}</span>
              <input type="number" min={1} value={form.capacity} onChange={(e) => set('capacity', parseInt(e.target.value) || 0)} className={inputCls} />
            </label>
          </div>

          <label className="block rounded-xl border border-border p-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Booking Mode</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set('booking_mode', 'exclusive')}
                className={`rounded-lg border px-3 py-2 text-left text-xs ${form.booking_mode === 'exclusive' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
              >
                <span className="block font-semibold">Exclusive</span>
                <span className="block">One booking holds the whole space</span>
              </button>
              <button
                type="button"
                onClick={() => set('booking_mode', 'shared')}
                className={`rounded-lg border px-3 py-2 text-left text-xs ${form.booking_mode === 'shared' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
              >
                <span className="block font-semibold">Shared (co-working)</span>
                <span className="block">Many bookings share the {form.capacity || 0} seats</span>
              </button>
            </div>
          </label>

          {/* Inventory rate-master link — authoritative price comes from inventory when set */}
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inventory Package (rate master)</span>
            <select
              value={form.inventory_item_id ?? ''}
              onChange={(e) => set('inventory_item_id', e.target.value || undefined)}
              className={inputCls}
            >
              <option value="">— Not linked (use manual rate) —</option>
              {inventoryOptions.map((it) => (
                <option key={it.id} value={it.id}>{it.name} ({it.sku})</option>
              ))}
            </select>
            {form.inventory_item_id && (
              <span className="mt-1 block text-[11px] text-muted-foreground">Session rate will be resolved from inventory pricing at booking time.</span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rate / Session</span>
              <input type="number" min={0} step={0.01} value={form.rate_per_session} onChange={(e) => set('rate_per_session', parseFloat(e.target.value) || 0)} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currency</span>
              <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={inputCls}>
                {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
