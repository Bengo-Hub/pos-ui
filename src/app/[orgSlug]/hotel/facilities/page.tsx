'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FacilityFormModal } from '@/components/hotel/facility-form-modal';
import {
  useFacilities,
  useBookFacility,
  useDeleteFacility,
} from '@/hooks/useHotel';
import { usePermissions, P } from '@/hooks/usePermissions';
import type { Facility } from '@/lib/api/hotel';
import { cn } from '@/lib/utils';
import { Building2, CalendarPlus, Edit2, Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';

const statusColors: Record<string, string> = {
  available:   'bg-green-500/10 text-green-700 dark:text-green-400',
  occupied:    'bg-red-500/10 text-red-700 dark:text-red-400',
  maintenance: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  closed:      'bg-muted text-muted-foreground',
};

const typeEmoji: Record<string, string> = {
  pool: '🏊', gym: '🏋️', conference: '🎙️', spa: '💆', kids_area: '🧒', other: '🏠',
};

// ─── Inline session-booking form ──────────────────────────────────────────────

const emptyBooking = { guest_name: '', phone: '', session_date: '', start_time: '', end_time: '', guests_count: '1' };

function BookingForm({ facilityId, onDone }: { facilityId: string; onDone: () => void }) {
  const [form, setForm] = useState(emptyBooking);
  const book = useBookFacility(facilityId);

  async function submit() {
    try {
      await book.mutateAsync({ ...form, guests_count: parseInt(form.guests_count) || 1 });
      toast.success('Facility booked');
      onDone();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Booking failed'));
    }
  }

  const fields: { key: string; label: string; placeholder?: string; type?: string }[] = [
    { key: 'guest_name', label: 'Guest Name', placeholder: 'Full name' },
    { key: 'phone', label: 'Phone', placeholder: '+254…' },
    { key: 'session_date', label: 'Date', type: 'date' },
    { key: 'start_time', label: 'Start', type: 'time' },
    { key: 'end_time', label: 'End', type: 'time' },
    { key: 'guests_count', label: 'Guests', type: 'number', placeholder: '1' },
  ];

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="grid grid-cols-2 gap-2">
        {fields.map(({ key, label, placeholder, type }) => (
          <label key={key} className={cn('block', key === 'guest_name' && 'col-span-2')}>
            <span className="text-xs font-medium text-foreground">{label}</span>
            <input
              type={type ?? 'text'}
              value={(form as any)[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              className="mt-0.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 rounded-lg border border-border py-2 text-sm font-medium hover:bg-muted">Cancel</button>
        <button onClick={submit} disabled={book.isPending} className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {book.isPending ? 'Booking…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function FacilitiesPage() {
  const { can } = usePermissions();
  const canManage = can(P.HOTEL_MANAGE);
  const { data: facilities = [], isLoading } = useFacilities();
  const deleteFacility = useDeleteFacility();

  const [bookingFacilityId, setBookingFacilityId] = useState<string | null>(null);
  const [formFacility, setFormFacility] = useState<Facility | null | 'new'>(null);
  const [deleteTarget, setDeleteTarget] = useState<Facility | null>(null);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteFacility.mutateAsync(deleteTarget.id);
      toast.success(`${deleteTarget.name} deleted`);
      setDeleteTarget(null);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to delete facility'));
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Facilities</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {facilities.length} {facilities.length === 1 ? 'facility' : 'facilities'}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setFormFacility('new')}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Add Facility
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : facilities.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border text-muted-foreground">
          <Building2 className="h-12 w-12 opacity-30" />
          <p>No facilities configured</p>
          {canManage && (
            <button onClick={() => setFormFacility('new')} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Add your first facility
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {facilities.map((facility) => (
            <div key={facility.id} className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-2xl">{typeEmoji[facility.facility_type] ?? '🏠'}</span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{facility.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">{facility.facility_type.replace('_', ' ')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', statusColors[facility.status])}>{facility.status}</span>
                  {canManage && (
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button onClick={() => setFormFacility(facility)} title="Edit" className="flex h-7 w-7 items-center justify-center rounded-lg border border-border hover:bg-primary/10 hover:text-primary">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(facility)} title="Delete" className="flex h-7 w-7 items-center justify-center rounded-lg border border-border hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Capacity</p>
                  <p className="font-medium text-foreground">{facility.capacity} guests</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Rate</p>
                  <p className="font-medium text-primary">{facility.currency ?? 'KES'} {(facility.rate_per_session ?? 0).toLocaleString()}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Hours</p>
                  <p className="font-medium text-foreground">{facility.opening_time || '—'} – {facility.closing_time || '—'}</p>
                </div>
              </div>

              <div className="mt-auto pt-4">
                {facility.status === 'available' && bookingFacilityId !== facility.id && (
                  <button onClick={() => setBookingFacilityId(facility.id)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary/10 py-2 text-sm font-semibold text-primary hover:bg-primary/20">
                    <CalendarPlus className="h-4 w-4" /> Book Session
                  </button>
                )}
                {bookingFacilityId === facility.id && (
                  <BookingForm facilityId={facility.id} onDone={() => setBookingFacilityId(null)} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {formFacility !== null && (
        <FacilityFormModal facility={formFacility === 'new' ? undefined : formFacility} onClose={() => setFormFacility(null)} />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete ${deleteTarget?.name ?? 'facility'}?`}
        description="This permanently removes the facility. Existing bookings are unaffected but no new sessions can be booked."
        confirmLabel="Delete Facility"
        variant="danger"
        onConfirm={handleDelete}
        loading={deleteFacility.isPending}
      />
    </div>
  );
}

export default function FacilitiesPageGated() {
  return (
    <ModuleGate moduleKey="hotel" fallback={<ModuleUnavailablePage moduleKey="hotel" />}>
      <FacilitiesPage />
    </ModuleGate>
  );
}
