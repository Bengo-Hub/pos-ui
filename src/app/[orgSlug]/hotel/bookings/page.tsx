'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/base';
import { Combobox } from '@/components/ui/combobox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useRoomBookings, useCreateRoomBooking, useUpdateRoomBooking, useInventoryBundles } from '@/hooks/useHotel';
import { usePermissions, P } from '@/hooks/usePermissions';
import type { CreateRoomBookingInput, RoomBooking } from '@/lib/api/hotel';
import { ArrowLeft, ChevronDown, ChevronRight, Loader2, Pencil, Plus, Users, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

const inputCls ='mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring';

type BookingType = 'group' | 'individual';

const STATUS_COLOR: Record<string, string> = {
  confirmed:   'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  checked_in:  'bg-green-500/10 text-green-700 dark:text-green-400',
  checked_out: 'bg-muted text-muted-foreground',
  cancelled:   'bg-red-500/10 text-red-700 dark:text-red-400',
  no_show:     'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

const emptyForm = (): CreateRoomBookingInput & { adults: number; children: number; booking_type: BookingType; notes: string; package_inclusions: string } => ({
  lead_guest_name: '', email: '', phone: '', rooms_count: 1,
  arrival_date: '', departure_date: '', market_segment: '', source: 'staff',
  inventory_rate_plan_bundle_id: '',
  booking_type: 'group', adults: 1, children: 0, notes: '', package_inclusions: '',
});

function toLocalInput(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const BOOKING_STATUSES = ['confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'];

function BookingEditModal({ b, onClose }: { b: RoomBooking; onClose: () => void }) {
  const update = useUpdateRoomBooking(b.id);
  const meta = b.metadata ?? {};
  const [form, setForm] = useState({
    lead_guest_name: b.lead_guest_name, email: b.email ?? '', phone: b.phone ?? '',
    rooms_count: b.rooms_count, status: b.status, market_segment: b.market_segment ?? '',
    arrival_date: toLocalInput(b.arrival_date), departure_date: toLocalInput(b.departure_date),
    adults: meta.adults ?? 1, children: meta.children ?? 0, notes: meta.notes ?? '',
  });
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await update.mutateAsync({
        lead_guest_name: form.lead_guest_name, email: form.email, phone: form.phone,
        rooms_count: form.rooms_count, status: form.status, market_segment: form.market_segment,
        arrival_date: form.arrival_date ? new Date(form.arrival_date).toISOString() : undefined,
        departure_date: form.departure_date ? new Date(form.departure_date).toISOString() : undefined,
        metadata: { ...meta, adults: form.adults, children: form.children, notes: form.notes || undefined },
      });
      toast.success(res.applied_fee > 0 ? `Booking amended — ${res.fee_currency} ${res.applied_fee.toLocaleString()} amendment fee applies` : 'Booking updated');
      onClose();
    } catch (e) { toast.error(await apiErrorMessage(e, 'Failed to update booking')); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-bold">Amend Booking <span className="text-xs font-normal text-muted-foreground">({b.confirmation_no})</span></h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted hover:bg-destructive/10 hover:text-destructive"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="text-sm font-medium">Lead Guest</span>
            <input value={form.lead_guest_name} onChange={(e) => set('lead_guest_name', e.target.value)} className={inputCls} /></label>
          <label className="block"><span className="text-sm font-medium">Email</span>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} /></label>
          <label className="block"><span className="text-sm font-medium">Phone</span>
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} /></label>
          <label className="block"><span className="text-sm font-medium">Rooms</span>
            <input type="number" min={1} value={form.rooms_count} onChange={(e) => set('rooms_count', parseInt(e.target.value) || 1)} className={inputCls} /></label>
          <label className="block"><span className="text-sm font-medium">Status</span>
            <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
              {BOOKING_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>)}
            </select></label>
          <label className="block"><span className="text-sm font-medium">Adults</span>
            <input type="number" min={1} value={form.adults} onChange={(e) => set('adults', parseInt(e.target.value) || 1)} className={inputCls} /></label>
          <label className="block"><span className="text-sm font-medium">Children</span>
            <input type="number" min={0} value={form.children} onChange={(e) => set('children', parseInt(e.target.value) || 0)} className={inputCls} /></label>
          <label className="block"><span className="text-sm font-medium">Arrival</span>
            <input type="datetime-local" value={form.arrival_date} onChange={(e) => set('arrival_date', e.target.value)} className={inputCls} /></label>
          <label className="block"><span className="text-sm font-medium">Departure</span>
            <input type="datetime-local" value={form.departure_date} onChange={(e) => set('departure_date', e.target.value)} className={inputCls} /></label>
          <label className="block sm:col-span-2"><span className="text-sm font-medium">Notes</span>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={inputCls} /></label>
          <p className="text-[11px] text-muted-foreground sm:col-span-2">Amendments made close to arrival may incur a fee per your booking policy.</p>
          <div className="flex gap-3 sm:col-span-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
            <button type="submit" disabled={update.isPending} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {update.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BookingRow({ b, canManage }: { b: RoomBooking; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancelMut = useUpdateRoomBooking(b.id);
  const meta = b.metadata ?? {};
  const isCancelled = b.status === 'cancelled';

  async function handleCancel() {
    try {
      const res = await cancelMut.mutateAsync({ status: 'cancelled' });
      toast.success(res.applied_fee > 0 ? `Booking cancelled — ${res.fee_currency} ${res.applied_fee.toLocaleString()} cancellation fee applies` : 'Booking cancelled');
      setConfirmCancel(false);
    } catch (e) { toast.error(await apiErrorMessage(e, 'Failed to cancel booking')); }
  }

  return (
    <li className="px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {b.lead_guest_name} <span className="text-xs text-muted-foreground">({b.confirmation_no})</span>
            </span>
            <span className="block text-xs text-muted-foreground">
              {b.rooms_count} room(s) · {new Date(b.arrival_date).toLocaleDateString()} → {new Date(b.departure_date).toLocaleDateString()}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground sm:inline">{(meta.booking_type ?? 'group')}</span>
          <span className={cn('rounded-full px-2 py-1 text-xs font-medium capitalize', STATUS_COLOR[b.status] ?? 'bg-muted text-muted-foreground')}>
            {b.status.replace('_', ' ')}
          </span>
          {canManage && !isCancelled && (
            <>
              <button onClick={() => setEditing(true)} title="Amend booking" className="flex h-7 w-7 items-center justify-center rounded-lg border border-border hover:bg-primary/10 hover:text-primary">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setConfirmCancel(true)} title="Cancel booking" className="flex h-7 w-7 items-center justify-center rounded-lg border border-border hover:bg-destructive/10 hover:text-destructive">
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl bg-muted/30 p-4 text-sm sm:grid-cols-3">
          {b.phone && <Detail label="Phone" value={b.phone} />}
          {b.email && <Detail label="Email" value={b.email} />}
          {b.market_segment && <Detail label="Segment" value={b.market_segment} />}
          <Detail label="Adults" value={String(meta.adults ?? '—')} />
          <Detail label="Children" value={String(meta.children ?? '—')} />
          {meta.package_inclusions && <Detail label="Package includes" value={meta.package_inclusions} full />}
          {meta.notes && <Detail label="Notes" value={meta.notes} full />}
        </div>
      )}

      {editing && <BookingEditModal b={b} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel booking ${b.confirmation_no}?`}
        description="A cancellation fee may apply if this is within the policy window before arrival. The guest will be notified."
        confirmLabel="Cancel Booking"
        variant="danger"
        onConfirm={handleCancel}
        loading={cancelMut.isPending}
      />
    </li>
  );
}

function Detail({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={cn(full && 'col-span-2 sm:col-span-3')}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}

function BookingsPageInner() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const { data: bookings = [], isLoading } = useRoomBookings();
  const { data: bundles = [] } = useInventoryBundles();
  const createMut = useCreateRoomBooking();
  const { can } = usePermissions();
  const canManage = can(P.HOTEL_MANAGE);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const isGroup = form.booking_type === 'group';

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleCreate() {
    if (!form.lead_guest_name.trim()) { toast.error('Guest name is required'); return; }
    try {
      await createMut.mutateAsync({
        lead_guest_name: form.lead_guest_name,
        email: form.email,
        phone: form.phone,
        rooms_count: isGroup ? form.rooms_count : 1,
        market_segment: form.market_segment,
        source: 'staff',
        inventory_rate_plan_bundle_id: form.inventory_rate_plan_bundle_id || undefined,
        arrival_date: form.arrival_date ? new Date(form.arrival_date).toISOString() : new Date().toISOString(),
        departure_date: form.departure_date ? new Date(form.departure_date).toISOString() : new Date().toISOString(),
        metadata: {
          booking_type: form.booking_type,
          adults: form.adults,
          children: form.children,
          notes: form.notes || undefined,
          package_inclusions: form.package_inclusions || undefined,
        },
      });
      toast.success('Booking created');
      setShowForm(false);
      setForm(emptyForm());
    } catch (e) { toast.error(await apiErrorMessage(e, 'Failed to create booking')); }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:px-8">
      <div className="flex items-center gap-3">
        <Link href={`/${orgSlug}/hotel`} className="rounded-lg p-2 transition-colors hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex flex-1 items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Bookings</h1>
            <p className="text-sm text-muted-foreground">Individual stays &amp; group / corporate reservations</p>
          </div>
        </div>
        {canManage && (
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            <Plus className="h-4 w-4" /> New Booking
          </button>
        )}
      </div>

      {showForm && canManage && (
        <Card><CardContent className="space-y-4 p-5">
          {/* Booking type toggle */}
          <div className="inline-flex rounded-xl border border-border p-1">
            {(['group', 'individual'] as BookingType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set('booking_type', t)}
                className={cn('rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors',
                  form.booking_type === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="text-sm font-medium">{isGroup ? 'Lead Guest / Organisation' : 'Guest Name'}</span>
              <input value={form.lead_guest_name} onChange={(e) => set('lead_guest_name', e.target.value)} className={inputCls} /></label>
            <label className="block"><span className="text-sm font-medium">Email</span>
              <input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} className={inputCls} /></label>
            <label className="block"><span className="text-sm font-medium">Phone</span>
              <input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} className={inputCls} /></label>

            {isGroup && (
              <label className="block"><span className="text-sm font-medium">Rooms</span>
                <input type="number" min={1} value={form.rooms_count} onChange={(e) => set('rooms_count', parseInt(e.target.value) || 1)} className={inputCls} /></label>
            )}
            <label className="block"><span className="text-sm font-medium">Adults</span>
              <input type="number" min={1} value={form.adults} onChange={(e) => set('adults', parseInt(e.target.value) || 1)} className={inputCls} /></label>
            <label className="block"><span className="text-sm font-medium">Children</span>
              <input type="number" min={0} value={form.children} onChange={(e) => set('children', parseInt(e.target.value) || 0)} className={inputCls} /></label>

            {isGroup && (
              <label className="block"><span className="text-sm font-medium">Market Segment</span>
                <input value={form.market_segment ?? ''} onChange={(e) => set('market_segment', e.target.value)} placeholder="corporate / ota / group" className={inputCls} /></label>
            )}
            <label className="block"><span className="text-sm font-medium">Arrival</span>
              <input type="datetime-local" value={form.arrival_date} onChange={(e) => set('arrival_date', e.target.value)} className={inputCls} /></label>
            <label className="block"><span className="text-sm font-medium">Departure</span>
              <input type="datetime-local" value={form.departure_date} onChange={(e) => set('departure_date', e.target.value)} className={inputCls} /></label>

            <label className="block sm:col-span-2"><span className="text-sm font-medium">Rate plan / Package (optional)</span>
              <div className="mt-1">
                <Combobox
                  options={bundles.map((b) => ({ value: b.id, label: b.name, hint: [b.sku, b.price ? `KES ${b.price.toLocaleString()}` : null].filter(Boolean).join(' · ') }))}
                  value={form.inventory_rate_plan_bundle_id ?? ''}
                  onChange={(v) => set('inventory_rate_plan_bundle_id', v)}
                  placeholder="Select a package / rate plan…"
                  searchPlaceholder="Search packages…"
                  emptyText="No inventory packages found"
                />
              </div>
            </label>
            <label className="block sm:col-span-2"><span className="text-sm font-medium">What&apos;s included (optional)</span>
              <input value={form.package_inclusions} onChange={(e) => set('package_inclusions', e.target.value)} placeholder="e.g. Breakfast, airport transfer, 2 spa sessions" className={inputCls} /></label>
            <label className="block sm:col-span-2"><span className="text-sm font-medium">Notes (optional)</span>
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={inputCls} /></label>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="flex-1 rounded-xl border border-border py-2.5 font-medium transition-colors hover:bg-muted">Cancel</button>
            <button onClick={handleCreate} disabled={createMut.isPending} className="flex-1 rounded-xl bg-primary py-2.5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
              {createMut.isPending ? 'Saving…' : 'Create Booking'}
            </button>
          </div>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : bookings.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No bookings yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {bookings.map((b) => <BookingRow key={b.id} b={b} canManage={canManage} />)}
          </ul>
        )}
      </CardContent></Card>
    </div>
  );
}

export default function BookingsPage() {
  return (
    <ModuleGate moduleKey="hotel" fallback={<ModuleUnavailablePage moduleKey="hotel" />}>
      <BookingsPageInner />
    </ModuleGate>
  );
}
