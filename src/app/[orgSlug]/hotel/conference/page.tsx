'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/base';
import {
  useFacilities,
  useEventBookings,
  useCreateEventBooking,
  useGenerateMealCards,
  useRedeemMealCard,
  useEventReconciliation,
  useInventoryBundles,
} from '@/hooks/useHotel';
import type { CreateEventBookingInput, EventBooking, Facility } from '@/lib/api/hotel';
import { usePermissions, P } from '@/hooks/usePermissions';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { formatCurrency } from '@/lib/utils';
import { Combobox } from '@/components/ui/combobox';
import { FacilityFormModal } from '@/components/hotel/facility-form-modal';
import { Loader2, Plus, Presentation, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { buildReconciliationColumns } from './reconciliation-columns';

const MEAL_PERIODS = [
  { v: 'breakfast', l: 'Breakfast' },
  { v: 'am_break', l: 'AM Break' },
  { v: 'lunch', l: 'Lunch' },
  { v: 'pm_break', l: 'PM Break' },
  { v: 'dinner', l: 'Dinner' },
];

const inputCls = 'mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring';

function ConferencePageInner() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const { data: facilities = [] } = useFacilities();
  const { data: events = [], isLoading } = useEventBookings();
  const { data: bundles = [] } = useInventoryBundles();
  const createMut = useCreateEventBooking();
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const { can } = usePermissions();
  const canAdd = can(P.CONFERENCE_ADD);
  const canManageVenue = can(P.HOTEL_MANAGE);

  const [showForm, setShowForm] = useState(false);
  const [showVenueModal, setShowVenueModal] = useState(false);
  const [selected, setSelected] = useState<EventBooking | null>(null);
  const [form, setForm] = useState<CreateEventBookingInput>({
    facility_id: '', title: '', client_name: '', contact_phone: '', contact_email: '',
    event_type: 'conference', start_at: '', end_at: '', conference_days: 1, delegate_count: 10,
    setup_style: 'theatre', inventory_bundle_id: '',
  });

  function set<K extends keyof CreateEventBookingInput>(k: K, v: CreateEventBookingInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleCreate() {
    if (!form.facility_id || !form.title || !form.client_name) {
      toast.error('Venue, title and client are required');
      return;
    }
    try {
      await createMut.mutateAsync({
        ...form,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : new Date().toISOString(),
        end_at: form.end_at ? new Date(form.end_at).toISOString() : new Date().toISOString(),
        inventory_bundle_id: form.inventory_bundle_id || undefined,
      });
      toast.success('Event booked');
      setShowForm(false);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to book event'));
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Presentation className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Conferences &amp; Events</h1>
            <p className="text-sm text-muted-foreground">BEO bookings &amp; delegate meal cards</p>
          </div>
        </div>
        {canAdd && (
          <button onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> New Event
          </button>
        )}
      </div>

      {showForm && canAdd && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block">
                <span className="text-sm font-medium">Venue</span>
                <div className="mt-1 flex gap-2">
                  <select value={form.facility_id} onChange={(e) => set('facility_id', e.target.value)} className={`${inputCls} flex-1`}>
                    <option value="">— Select venue —</option>
                    {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  {canManageVenue && (
                    <button
                      type="button"
                      onClick={() => setShowVenueModal(true)}
                      title="Add a new venue"
                      className="flex shrink-0 items-center gap-1 rounded-xl border border-input px-3 text-sm font-medium text-primary hover:bg-primary/10"
                    >
                      <Plus className="h-4 w-4" /> New
                    </button>
                  )}
                </div>
              </label>
              <label className="block">
                <span className="text-sm font-medium">Event Type</span>
                <select value={form.event_type} onChange={(e) => set('event_type', e.target.value)} className={inputCls}>
                  <option value="conference">Conference</option>
                  <option value="wedding">Wedding</option>
                  <option value="party">Party</option>
                  <option value="anniversary">Anniversary</option>
                  <option value="meeting">Meeting</option>
                </select>
              </label>
              <label className="block sm:col-span-2 lg:col-span-3">
                <span className="text-sm font-medium">Title</span>
                <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. ABC Ltd Annual Conference" className={inputCls} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Client Name</span>
                <input value={form.client_name} onChange={(e) => set('client_name', e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Contact Phone</span>
                <input value={form.contact_phone ?? ''} onChange={(e) => set('contact_phone', e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Start</span>
                <input type="datetime-local" value={form.start_at} onChange={(e) => set('start_at', e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">End</span>
                <input type="datetime-local" value={form.end_at} onChange={(e) => set('end_at', e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Conference Days</span>
                <input type="number" min={1} value={form.conference_days} onChange={(e) => set('conference_days', parseInt(e.target.value) || 1)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Delegates</span>
                <input type="number" min={0} value={form.delegate_count} onChange={(e) => set('delegate_count', parseInt(e.target.value) || 0)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Setup Style</span>
                <select value={form.setup_style} onChange={(e) => set('setup_style', e.target.value)} className={inputCls}>
                  <option value="theatre">Theatre</option>
                  <option value="classroom">Classroom</option>
                  <option value="boardroom">Boardroom</option>
                  <option value="u_shape">U-Shape</option>
                  <option value="cabaret">Cabaret</option>
                  <option value="banquet">Banquet</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">Package (optional)</span>
                <div className="mt-1">
                  <Combobox
                    options={bundles.map((b) => ({
                      value: b.id,
                      label: b.name,
                      hint: [b.sku, b.price ? formatCurrency(b.price, currency) : null].filter(Boolean).join(' · '),
                    }))}
                    value={form.inventory_bundle_id ?? ''}
                    onChange={(v) => set('inventory_bundle_id', v)}
                    placeholder="Select a package…"
                    searchPlaceholder="Search packages…"
                    emptyText="No inventory packages found"
                  />
                </div>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Total is calculated from the package rate — flat hall hire stays fixed within capacity; per-delegate packages scale with delegates × days.
                </span>
              </label>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-border font-medium hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={createMut.isPending}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {createMut.isPending ? 'Saving…' : 'Book Event'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : events.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No events booked yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((ev) => (
                <li key={ev.id} className="px-5 py-3">
                  <button onClick={() => setSelected(selected?.id === ev.id ? null : ev)} className="w-full flex items-center justify-between text-left">
                    <div>
                      <p className="font-medium">{ev.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {ev.event_type} · {ev.delegate_count} delegates · {ev.conference_days} day(s)
                      </p>
                    </div>
                    <span className="flex items-center gap-2">
                      <Link href={`/${orgSlug}/hotel/conference/${ev.id}`} onClick={(e) => e.stopPropagation()} className="text-xs text-primary hover:underline">Open ↗</Link>
                      <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">{ev.status}</span>
                    </span>
                  </button>
                  {selected?.id === ev.id && <EventPanel event={ev} />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {showVenueModal && (
        <FacilityFormModal
          onClose={() => setShowVenueModal(false)}
          onCreated={(f: Facility) => set('facility_id', f.id)}
        />
      )}
    </div>
  );
}

function EventPanel({ event }: { event: EventBooking }) {
  const [periods, setPeriods] = useState<string[]>(['breakfast', 'lunch']);
  const [redeemCode, setRedeemCode] = useState('');
  const genMut = useGenerateMealCards(event.id);
  const redeemMut = useRedeemMealCard();
  const { data: recon } = useEventReconciliation(event.id, true);
  const { can } = usePermissions();
  const canManage = can(P.CONFERENCE_MANAGE);
  const canRedeem = can(P.CONFERENCE_CHANGE);
  const reconColumns = buildReconciliationColumns();

  function togglePeriod(p: string) {
    setPeriods((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }

  async function handleGenerate() {
    if (periods.length === 0) { toast.error('Select at least one meal period'); return; }
    try {
      const res = await genMut.mutateAsync({ meal_periods: periods });
      toast.success(`${res.cards_issued} meal cards generated`);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to generate meal cards (already generated?)'));
    }
  }

  async function handleRedeem() {
    if (!redeemCode.trim()) return;
    try {
      await redeemMut.mutateAsync({ code: redeemCode.trim(), body: {} });
      toast.success('Meal card redeemed');
      setRedeemCode('');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Redemption failed (invalid, expired, or already used)'));
    }
  }

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-border bg-muted/30 p-4">
      {/* Generate meal cards — only for an active event */}
      {canManage && event.status !== 'cancelled' && event.status !== 'completed' && (
        <div className="space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2"><Ticket className="h-4 w-4" /> Generate Meal Cards</p>
          <div className="flex flex-wrap gap-2">
            {MEAL_PERIODS.map((m) => (
              <button key={m.v} type="button" onClick={() => togglePeriod(m.v)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${periods.includes(m.v) ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'}`}>
                {m.l}
              </button>
            ))}
          </div>
          <button onClick={handleGenerate} disabled={genMut.isPending}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {genMut.isPending ? 'Generating…' : `Generate (${event.delegate_count} × ${event.conference_days}d × ${periods.length})`}
          </button>
        </div>
      )}

      {/* Redeem — not on a cancelled event */}
      {canRedeem && event.status !== 'cancelled' && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Redeem Meal Card</p>
          <div className="flex gap-2">
            <input value={redeemCode} onChange={(e) => setRedeemCode(e.target.value)} placeholder="Scan / enter code (MC-…)"
              className="flex-1 px-4 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <button onClick={handleRedeem} disabled={redeemMut.isPending}
              className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors">
              Redeem
            </button>
          </div>
        </div>
      )}

      {/* Reconciliation */}
      {recon && recon.rows.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-semibold">Reconciliation</p>
          <DataTable
            columns={reconColumns}
            rows={recon.rows}
            rowKey={(r) => `${r.conference_day}-${r.meal_period}`}
            storageKey="event-reconciliation-col-prefs"
          />
        </div>
      )}
    </div>
  );
}

export default function ConferencePage() {
  return (
    <ModuleGate moduleKey="hotel" fallback={<ModuleUnavailablePage moduleKey="hotel" />}>
      <ConferencePageInner />
    </ModuleGate>
  );
}
