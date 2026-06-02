'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/base';
import {
  useFacilities,
  useEventBookings,
  useCreateEventBooking,
  useGenerateMealCards,
  useRedeemMealCard,
  useEventReconciliation,
} from '@/hooks/useHotel';
import type { CreateEventBookingInput, EventBooking } from '@/lib/api/hotel';
import { Loader2, Plus, Presentation, Ticket } from 'lucide-react';
import { toast } from 'sonner';

const MEAL_PERIODS = [
  { v: 'breakfast', l: 'Breakfast' },
  { v: 'am_break', l: 'AM Break' },
  { v: 'lunch', l: 'Lunch' },
  { v: 'pm_break', l: 'PM Break' },
  { v: 'dinner', l: 'Dinner' },
];

const inputCls = 'mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring';

export default function ConferencePage() {
  const { data: facilities = [] } = useFacilities();
  const { data: events = [], isLoading } = useEventBookings();
  const createMut = useCreateEventBooking();

  const [showForm, setShowForm] = useState(false);
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
    } catch {
      toast.error('Failed to book event');
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
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
        <button onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> New Event
        </button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">Venue</span>
                <select value={form.facility_id} onChange={(e) => set('facility_id', e.target.value)} className={inputCls}>
                  <option value="">— Select venue —</option>
                  {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
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
              <label className="block col-span-2">
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
                <span className="text-sm font-medium">Package Bundle ID (optional)</span>
                <input value={form.inventory_bundle_id ?? ''} onChange={(e) => set('inventory_bundle_id', e.target.value)} placeholder="inventory Bundle UUID" className={inputCls} />
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
                    <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">{ev.status}</span>
                  </button>
                  {selected?.id === ev.id && <EventPanel event={ev} />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EventPanel({ event }: { event: EventBooking }) {
  const [periods, setPeriods] = useState<string[]>(['breakfast', 'lunch']);
  const [redeemCode, setRedeemCode] = useState('');
  const genMut = useGenerateMealCards(event.id);
  const redeemMut = useRedeemMealCard();
  const { data: recon } = useEventReconciliation(event.id, true);

  function togglePeriod(p: string) {
    setPeriods((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }

  async function handleGenerate() {
    if (periods.length === 0) { toast.error('Select at least one meal period'); return; }
    try {
      const res = await genMut.mutateAsync({ meal_periods: periods });
      toast.success(`${res.cards_issued} meal cards generated`);
    } catch {
      toast.error('Failed to generate meal cards (already generated?)');
    }
  }

  async function handleRedeem() {
    if (!redeemCode.trim()) return;
    try {
      await redeemMut.mutateAsync({ code: redeemCode.trim(), body: {} });
      toast.success('Meal card redeemed');
      setRedeemCode('');
    } catch {
      toast.error('Redemption failed (invalid, expired, or already used)');
    }
  }

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-border bg-muted/30 p-4">
      {/* Generate meal cards */}
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

      {/* Redeem */}
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

      {/* Reconciliation */}
      {recon && recon.rows.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-semibold">Reconciliation</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1">Day</th><th>Meal</th><th className="text-right">Issued</th><th className="text-right">Redeemed</th>
              </tr>
            </thead>
            <tbody>
              {recon.rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1">{r.conference_day}</td>
                  <td className="capitalize">{r.meal_period.replace('_', ' ')}</td>
                  <td className="text-right">{r.issued}</td>
                  <td className="text-right">{r.redeemed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
