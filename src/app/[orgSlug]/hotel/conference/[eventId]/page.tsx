'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/base';
import {
  useEventBooking,
  useGenerateMealCards,
  useRedeemMealCard,
  useEventReconciliation,
  useUpdateEventBooking,
} from '@/hooks/useHotel';
import { usePermissions, P } from '@/hooks/usePermissions';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { formatCurrency } from '@/lib/utils';
import type { EventBooking } from '@/lib/api/hotel';
import { ArrowLeft, Loader2, Pencil, Presentation, Ticket, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

const MEAL_PERIODS = [
  { v: 'breakfast', l: 'Breakfast' },
  { v: 'am_break', l: 'AM Break' },
  { v: 'lunch', l: 'Lunch' },
  { v: 'pm_break', l: 'PM Break' },
  { v: 'dinner', l: 'Dinner' },
];

const EVENT_STATUSES = ['inquiry', 'tentative', 'confirmed', 'in_progress', 'completed', 'cancelled'];
const editInputCls = 'mt-1 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring';

function toLocalInput(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function EventEditModal({ event, onClose }: { event: EventBooking; onClose: () => void }) {
  const update = useUpdateEventBooking(event.id);
  const [form, setForm] = useState({
    title: event.title,
    delegate_count: event.delegate_count,
    conference_days: event.conference_days,
    setup_style: event.setup_style ?? 'theatre',
    status: event.status,
    start_at: toLocalInput(event.start_at),
    end_at: toLocalInput(event.end_at),
  });
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        title: form.title,
        delegate_count: form.delegate_count,
        conference_days: form.conference_days,
        setup_style: form.setup_style,
        status: form.status,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : undefined,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : undefined,
      });
      toast.success('Event updated. Re-run “Generate / Top up” to issue cards for any added delegates or days.');
      onClose();
    } catch (e) { toast.error(await apiErrorMessage(e, 'Failed to update event')); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-bold">Edit Event</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted hover:bg-destructive/10 hover:text-destructive"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5">
          <label className="block"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title</span>
            <input value={form.title} onChange={(e) => set('title', e.target.value)} className={editInputCls} /></label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delegates</span>
              <input type="number" min={0} value={form.delegate_count} onChange={(e) => set('delegate_count', parseInt(e.target.value) || 0)} className={editInputCls} /></label>
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conference Days</span>
              <input type="number" min={1} value={form.conference_days} onChange={(e) => set('conference_days', parseInt(e.target.value) || 1)} className={editInputCls} /></label>
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Start</span>
              <input type="datetime-local" value={form.start_at} onChange={(e) => set('start_at', e.target.value)} className={editInputCls} /></label>
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">End</span>
              <input type="datetime-local" value={form.end_at} onChange={(e) => set('end_at', e.target.value)} className={editInputCls} /></label>
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setup Style</span>
              <select value={form.setup_style} onChange={(e) => set('setup_style', e.target.value)} className={editInputCls}>
                {['theatre', 'classroom', 'boardroom', 'u_shape', 'cabaret', 'banquet'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select></label>
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={editInputCls}>
                {EVENT_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select></label>
          </div>
          <div className="flex gap-3 pt-1">
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

function EventDetailPageInner() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const eventId = params?.eventId as string;

  const { can } = usePermissions();
  const canManage = can(P.CONFERENCE_MANAGE);
  const canEdit = can(P.CONFERENCE_CHANGE) || canManage;
  const { data: event, isLoading } = useEventBooking(eventId);
  const { data: recon } = useEventReconciliation(eventId, true);
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const genMut = useGenerateMealCards(eventId);
  const redeemMut = useRedeemMealCard();

  const [periods, setPeriods] = useState<string[]>(['breakfast', 'lunch']);
  const [redeemCode, setRedeemCode] = useState('');
  const [editing, setEditing] = useState(false);

  function togglePeriod(p: string) {
    setPeriods((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }
  async function handleGenerate() {
    if (periods.length === 0) { toast.error('Select at least one meal period'); return; }
    try {
      const res = await genMut.mutateAsync({ meal_periods: periods });
      toast.success(res.cards_issued > 0 ? `${res.cards_issued} meal card(s) issued` : 'All meal cards already up to date');
    } catch (e) { toast.error(await apiErrorMessage(e, 'Failed to generate meal cards')); }
  }
  async function handleRedeem() {
    if (!redeemCode.trim()) return;
    try {
      await redeemMut.mutateAsync({ code: redeemCode.trim(), body: {} });
      toast.success('Meal card redeemed'); setRedeemCode('');
    } catch (e) { toast.error(await apiErrorMessage(e, 'Redemption failed (invalid, expired, or already used)')); }
  }

  if (isLoading || !event) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const cards = event.edges?.meal_entitlements ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:px-8">
      <div className="flex items-center gap-3">
        <Link href={`/${orgSlug}/hotel/conference`} className="p-2 rounded-lg hover:bg-muted transition-colors"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center"><Presentation className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{event.title}</h1>
            <p className="text-sm text-muted-foreground capitalize">{event.event_type} · {event.client_name}</p>
          </div>
        </div>
        <span className="ml-auto text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground capitalize">{event.status}</span>
        {canEdit && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        )}
      </div>

      <Card><CardContent className="p-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {[
            { label: 'Delegates', value: String(event.delegate_count) },
            { label: 'Conference Days', value: String(event.conference_days) },
            { label: 'Setup', value: event.setup_style || '—' },
            { label: 'Contact', value: event.contact_email || event.contact_phone || '—' },
            { label: 'Start', value: new Date(event.start_at).toLocaleString() },
            { label: 'End', value: new Date(event.end_at).toLocaleString() },
            { label: 'Total', value: formatCurrency(event.total_amount || 0, currency), highlight: true },
          ].map(({ label, value, highlight }) => (
            <div key={label}>
              <p className="text-muted-foreground">{label}</p>
              <p className={highlight ? 'font-semibold text-primary' : 'font-semibold text-foreground'}>{value}</p>
            </div>
          ))}
        </div>
      </CardContent></Card>

      {/* Meal card summary */}
      {cards.length > 0 && (
        <Card><CardContent className="p-5">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><p className="text-muted-foreground">Issued</p><p className="text-lg font-bold text-foreground">{cards.length}</p></div>
            <div><p className="text-muted-foreground">Redeemed</p><p className="text-lg font-bold text-green-600">{cards.filter((c) => c.status === 'redeemed').length}</p></div>
            <div><p className="text-muted-foreground">Remaining</p><p className="text-lg font-bold text-primary">{cards.filter((c) => c.status === 'issued').length}</p></div>
          </div>
        </CardContent></Card>
      )}

      {/* Generate / top-up meal cards — only for an active event */}
      {canManage && event.status !== 'cancelled' && event.status !== 'completed' && (
        <Card><CardContent className="p-5 space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2"><Ticket className="h-4 w-4" /> Generate / Top-up Meal Cards</p>
          <p className="text-xs text-muted-foreground">
            Re-running tops up cards for any new delegates, added meal periods, or extra days — existing cards are never duplicated.
          </p>
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
            {genMut.isPending ? 'Generating…' : `Generate / Top up (${event.delegate_count} × ${event.conference_days}d × ${periods.length})`}
          </button>
        </CardContent></Card>
      )}

      {/* Redeem — requires conference change permission and a non-cancelled event */}
      {canEdit && event.status !== 'cancelled' && (
        <Card><CardContent className="p-5 space-y-2">
          <p className="text-sm font-semibold">Redeem Meal Card</p>
          <div className="flex gap-2">
            <input value={redeemCode} onChange={(e) => setRedeemCode(e.target.value)} placeholder="Scan / enter code (MC-…)"
              className="flex-1 px-4 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <button onClick={handleRedeem} disabled={redeemMut.isPending}
              className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors">Redeem</button>
          </div>
        </CardContent></Card>
      )}

      {/* Reconciliation */}
      {recon && recon.rows.length > 0 && (
        <Card><CardContent className="p-5 space-y-1">
          <p className="text-sm font-semibold">Reconciliation</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Day</th><th>Meal</th><th className="text-right">Issued</th><th className="text-right">Redeemed</th></tr></thead>
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
        </CardContent></Card>
      )}

      {editing && <EventEditModal event={event} onClose={() => setEditing(false)} />}
    </div>
  );
}

export default function EventDetailPage() {
  return (
    <ModuleGate moduleKey="hotel" fallback={<ModuleUnavailablePage moduleKey="hotel" />}>
      <EventDetailPageInner />
    </ModuleGate>
  );
}
