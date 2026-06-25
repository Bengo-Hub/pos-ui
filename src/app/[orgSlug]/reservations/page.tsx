'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format, addDays, isToday, isTomorrow, parseISO } from 'date-fns';
import {
  Calendar,
  CalendarCheck,
  CalendarX,
  ChefHat,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  Users,
  X,
  Phone,
  Mail,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageGuard } from '@/components/auth/page-guard';
import { P } from '@/lib/rbac/permissions';
import {
  useReservations,
  useAvailableSlots,
  useCreateReservation,
  useConfirmReservation,
  useCheckInReservation,
  useCancelReservation,
  type TableReservation,
  type CreateReservationInput,
} from '@/hooks/usePOS';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api/error-message';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS = {
  pending:    { label: 'Pending',    color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',   dot: 'bg-amber-500'   },
  confirmed:  { label: 'Confirmed',  color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',      dot: 'bg-blue-500'    },
  checked_in: { label: 'Checked In', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  cancelled:  { label: 'Cancelled',  color: 'bg-red-500/15 text-red-700 dark:text-red-400',         dot: 'bg-red-400'     },
  no_show:    { label: 'No Show',    color: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',       dot: 'bg-gray-400'    },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS[status as keyof typeof STATUS] ?? STATUS.pending;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', cfg.color)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

// ─── New Reservation Modal ────────────────────────────────────────────────────

function NewReservationModal({
  date,
  outletId,
  onClose,
}: {
  date: string;
  outletId: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    guest_name: '',
    guest_phone: '',
    guest_email: '',
    party_size: 2,
    date: date,
    time: '19:00',
    duration_minutes: 90,
    notes: '',
    special_requests: '',
    table_id: '',
  });

  const { data: slotsData, isLoading: slotsLoading } = useAvailableSlots({
    date: form.date,
    partySize: form.party_size,
    outletId,
  });
  const tables = slotsData?.tables ?? [];
  const createReservation = useCreateReservation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.guest_name.trim()) { toast.error('Guest name is required'); return; }
    if (!form.guest_phone.trim() && !form.guest_email.trim()) {
      toast.error('Phone or email is required for confirmation'); return;
    }

    const scheduledAt = new Date(`${form.date}T${form.time}:00`).toISOString();
    const input: CreateReservationInput = {
      outlet_id: outletId,
      guest_name: form.guest_name,
      guest_phone: form.guest_phone || undefined,
      guest_email: form.guest_email || undefined,
      party_size: form.party_size,
      scheduled_at: scheduledAt,
      duration_minutes: form.duration_minutes,
      notes: form.notes || undefined,
      special_requests: form.special_requests || undefined,
      table_id: form.table_id || undefined,
      source: 'staff',
    };

    createReservation.mutate(input, {
      onSuccess: () => {
        toast.success('Reservation created');
        onClose();
      },
      onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to create reservation')),
    });
  };

  const field = (key: keyof typeof form, val: any) =>
    setForm((f) => ({ ...f, [key]: val }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-bold text-base flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            New Reservation
          </h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Guest info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Guest Name *</label>
              <input
                value={form.guest_name}
                onChange={(e) => field('guest_name', e.target.value)}
                placeholder="Full name"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Party Size *</label>
              <input
                type="number"
                min={1}
                max={50}
                value={form.party_size}
                onChange={(e) => field('party_size', Number(e.target.value))}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1 flex items-center gap-1">
                <Phone className="h-3 w-3" /> Phone
              </label>
              <input
                value={form.guest_phone}
                onChange={(e) => field('guest_phone', e.target.value)}
                placeholder="+254712345678"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 flex items-center gap-1">
                <Mail className="h-3 w-3" /> Email
              </label>
              <input
                type="email"
                value={form.guest_email}
                onChange={(e) => field('guest_email', e.target.value)}
                placeholder="guest@email.com"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          {/* Date / time / duration */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Date *</label>
              <input
                type="date"
                value={form.date}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => field('date', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Time *</label>
              <input
                type="time"
                value={form.time}
                onChange={(e) => field('time', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Duration (min)</label>
              <select
                value={form.duration_minutes}
                onChange={(e) => field('duration_minutes', Number(e.target.value))}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 bg-background"
              >
                {[30, 60, 90, 120, 150, 180].map((d) => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table picker */}
          <div>
            <label className="block text-xs font-semibold mb-2">
              Preferred Table {slotsLoading && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => field('table_id', '')}
                className={cn(
                  'flex flex-col items-center justify-center p-2 rounded-xl border-2 text-xs font-semibold transition-all min-h-14',
                  !form.table_id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'
                )}
              >
                Any
              </button>
              {tables.map((t: any) => {
                const busy = t.booked_slots?.length > 0;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={t.status === 'occupied'}
                    onClick={() => field('table_id', form.table_id === t.id ? '' : t.id)}
                    className={cn(
                      'flex flex-col items-center justify-center p-2 rounded-xl border-2 text-xs font-semibold transition-all min-h-14',
                      t.status === 'occupied'
                        ? 'border-border opacity-40 cursor-not-allowed'
                        : form.table_id === t.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : busy
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                        : 'border-border hover:border-primary/40'
                    )}
                  >
                    <span className="font-bold">{t.name}</span>
                    <span className="text-[10px] opacity-70">{t.capacity} seats</span>
                    {busy && <span className="text-[9px] text-amber-600 mt-0.5">{t.booked_slots.length} booked</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold mb-1 flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> Special Requests / Notes
            </label>
            <textarea
              rows={2}
              value={form.special_requests}
              onChange={(e) => field('special_requests', e.target.value)}
              placeholder="Dietary requirements, occasion, seating preferences…"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createReservation.isPending}
              className="flex-1 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {createReservation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />}
              Create Reservation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Reservation Card ─────────────────────────────────────────────────────────

function ReservationCard({
  res,
  onConfirm,
  onCheckIn,
  onCancel,
}: {
  res: TableReservation;
  onConfirm: (id: string) => void;
  onCheckIn: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const time = format(parseISO(res.scheduled_at), 'HH:mm');
  const end = format(new Date(parseISO(res.scheduled_at).getTime() + res.duration_minutes * 60_000), 'HH:mm');

  return (
    <div className={cn(
      'rounded-2xl border-2 p-4 space-y-3 transition-all',
      res.status === 'checked_in' ? 'border-emerald-500 bg-emerald-500/5' :
      res.status === 'confirmed'  ? 'border-blue-500 bg-blue-500/5' :
      res.status === 'pending'    ? 'border-amber-400 bg-amber-400/5' :
      'border-border opacity-60'
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-sm">{res.guest_name}</p>
            <StatusBadge status={res.status} />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{time}–{end}</span>
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{res.party_size} guests</span>
            {res.guest_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{res.guest_phone}</span>}
          </div>
          {res.special_requests && (
            <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">"{res.special_requests}"</p>
          )}
        </div>
        <div className="text-right text-xs text-muted-foreground shrink-0">
          {res.source === 'online_widget' && (
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold text-[10px]">Online</span>
          )}
        </div>
      </div>

      {/* Actions */}
      {(res.status === 'pending' || res.status === 'confirmed') && (
        <div className="flex gap-2 flex-wrap">
          {res.status === 'pending' && (
            <button
              onClick={() => onConfirm(res.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-semibold hover:bg-blue-600 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
            </button>
          )}
          {res.status === 'confirmed' && (
            <button
              onClick={() => onCheckIn(res.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors"
            >
              <ChefHat className="h-3.5 w-3.5" /> Check In
            </button>
          )}
          <button
            onClick={() => onCancel(res.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/50 text-destructive text-xs font-semibold hover:bg-destructive/10 transition-colors"
          >
            <CalendarX className="h-3.5 w-3.5" /> Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ReservationsPage() {
  const outlet = useAuthStore((s) => s.outlet);
  const params = useParams();
  const router = useRouter();
  const orgSlug = params?.orgSlug as string;

  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [statusFilter, setStatusFilter] = useState('all');
  const [newOpen, setNewOpen] = useState(false);
  // Default to "Upcoming" so newly-submitted reservations (often future-dated, incl. from the public
  // booking widget) are visible without having to navigate to their exact day. Toggle to per-day view.
  const [viewMode, setViewMode] = useState<'upcoming' | 'day'>('upcoming');

  const confirm = useConfirmReservation();
  const checkIn = useCheckInReservation();
  const cancel = useCancelReservation();

  const { data, isLoading } = useReservations({
    date: viewMode === 'day' ? selectedDate : undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    outletId: outlet?.id,
  });
  // In Upcoming mode, show today onward (hide long-past bookings) sorted by time.
  const reservations = useMemo(() => {
    const all = data?.data ?? [];
    if (viewMode === 'day') return all;
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    return all
      .filter((r) => new Date(r.scheduled_at).getTime() >= startOfToday.getTime() || r.status === 'pending')
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [data, viewMode]);

  const dateLabel = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    if (isToday(d)) return 'Today';
    if (isTomorrow(d)) return 'Tomorrow';
    return format(d, 'EEE, d MMM');
  }, [selectedDate]);

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate + 'T12:00:00');
    setSelectedDate(format(addDays(d, days), 'yyyy-MM-dd'));
  };

  const counts = useMemo(() => {
    const c = { pending: 0, confirmed: 0, checked_in: 0, cancelled: 0 };
    reservations.forEach((r) => { if (r.status in c) (c as any)[r.status]++; });
    return c;
  }, [reservations]);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold font-display flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Reservations
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage table bookings and guest check-ins</p>
        </div>
        <button
          onClick={() => setNewOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
        >
          <Plus className="h-4 w-4" />
          New Reservation
        </button>
      </div>

      {/* View mode + date navigator */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-xl border border-border overflow-hidden">
          {(['upcoming', 'day'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={cn('px-3 py-2 text-xs font-bold transition-colors',
                viewMode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
            >
              {m === 'upcoming' ? 'Upcoming' : 'By Day'}
            </button>
          ))}
        </div>
        {viewMode === 'day' ? (
          <>
            <button onClick={() => shiftDate(-1)} className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-muted transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex-1 text-center min-w-32">
              <p className="font-bold text-sm">{dateLabel}</p>
              <p className="text-xs text-muted-foreground">{format(new Date(selectedDate + 'T12:00:00'), 'EEEE, MMMM d yyyy')}</p>
            </div>
            <button onClick={() => shiftDate(1)} className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-muted transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 bg-background"
            />
          </>
        ) : (
          <p className="flex-1 text-sm font-semibold text-muted-foreground">All upcoming bookings</p>
        )}
      </div>

      {/* Summary pills */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all',       label: 'All',        count: reservations.length },
          { key: 'pending',   label: 'Pending',     count: counts.pending,   dot: 'bg-amber-500' },
          { key: 'confirmed', label: 'Confirmed',   count: counts.confirmed, dot: 'bg-blue-500'  },
          { key: 'checked_in', label: 'Checked In', count: counts.checked_in, dot: 'bg-emerald-500' },
          { key: 'cancelled', label: 'Cancelled',   count: counts.cancelled, dot: 'bg-red-400'   },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
              statusFilter === f.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {f.dot && <span className={cn('h-1.5 w-1.5 rounded-full', f.dot)} />}
            {f.label}
            <span className="ml-0.5 opacity-70">{f.count}</span>
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : reservations.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Calendar className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-semibold text-muted-foreground">
            No {statusFilter !== 'all' ? statusFilter : ''} reservations for {dateLabel.toLowerCase()}
          </p>
          <button onClick={() => setNewOpen(true)} className="text-xs text-primary underline">
            Add a reservation
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {reservations.map((res) => (
            <ReservationCard
              key={res.id}
              res={res}
              onConfirm={(id) => confirm.mutate({ id }, {
                onSuccess: () => toast.success('Reservation confirmed — table marked Reserved'),
                onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to confirm')),
              })}
              onCheckIn={(id) => checkIn.mutate(id, {
                onSuccess: () => {
                  toast.success('Guest checked in — table marked Occupied');
                  router.push(`/${orgSlug}/tables`);
                },
                onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to check in')),
              })}
              onCancel={(id) => cancel.mutate({ id }, {
                onSuccess: () => toast.success('Reservation cancelled'),
                onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to cancel')),
              })}
            />
          ))}
        </div>
      )}

      {newOpen && outlet?.id && (
        <NewReservationModal
          date={selectedDate}
          outletId={outlet.id}
          onClose={() => setNewOpen(false)}
        />
      )}
    </div>
  );
}

export default function ReservationsPageGated() {
  return (
    <PageGuard moduleKey="reservations" permission={[P.TABLES_VIEW, P.TABLES_MANAGE]} label="Reservations">
      <ReservationsPage />
    </PageGuard>
  );
}
