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
} from '@/hooks/useHotel';
import { ArrowLeft, Loader2, Presentation, Ticket } from 'lucide-react';
import { toast } from 'sonner';

const MEAL_PERIODS = [
  { v: 'breakfast', l: 'Breakfast' },
  { v: 'am_break', l: 'AM Break' },
  { v: 'lunch', l: 'Lunch' },
  { v: 'pm_break', l: 'PM Break' },
  { v: 'dinner', l: 'Dinner' },
];

export default function EventDetailPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const eventId = params?.eventId as string;

  const { data: event, isLoading } = useEventBooking(eventId);
  const { data: recon } = useEventReconciliation(eventId, true);
  const genMut = useGenerateMealCards(eventId);
  const redeemMut = useRedeemMealCard();

  const [periods, setPeriods] = useState<string[]>(['breakfast', 'lunch']);
  const [redeemCode, setRedeemCode] = useState('');

  function togglePeriod(p: string) {
    setPeriods((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }
  async function handleGenerate() {
    if (periods.length === 0) { toast.error('Select at least one meal period'); return; }
    try {
      const res = await genMut.mutateAsync({ meal_periods: periods });
      toast.success(`${res.cards_issued} meal cards generated`);
    } catch { toast.error('Failed (already generated?)'); }
  }
  async function handleRedeem() {
    if (!redeemCode.trim()) return;
    try {
      await redeemMut.mutateAsync({ code: redeemCode.trim(), body: {} });
      toast.success('Meal card redeemed'); setRedeemCode('');
    } catch { toast.error('Redemption failed (invalid, expired, or already used)'); }
  }

  if (isLoading || !event) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const cards = event.edges?.meal_entitlements ?? [];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
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
            { label: 'Total', value: `KES ${(event.total_amount || 0).toLocaleString()}`, highlight: true },
          ].map(({ label, value, highlight }) => (
            <div key={label}>
              <p className="text-muted-foreground">{label}</p>
              <p className={highlight ? 'font-semibold text-primary' : 'font-semibold text-foreground'}>{value}</p>
            </div>
          ))}
        </div>
      </CardContent></Card>

      {/* Generate meal cards */}
      <Card><CardContent className="p-5 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2"><Ticket className="h-4 w-4" /> Generate Meal Cards</p>
        <div className="flex flex-wrap gap-2">
          {MEAL_PERIODS.map((m) => (
            <button key={m.v} type="button" onClick={() => togglePeriod(m.v)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${periods.includes(m.v) ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'}`}>
              {m.l}
            </button>
          ))}
        </div>
        <button onClick={handleGenerate} disabled={genMut.isPending || cards.length > 0}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {cards.length > 0 ? `${cards.length} cards already issued` : genMut.isPending ? 'Generating…' : `Generate (${event.delegate_count} × ${event.conference_days}d × ${periods.length})`}
        </button>
      </CardContent></Card>

      {/* Redeem */}
      <Card><CardContent className="p-5 space-y-2">
        <p className="text-sm font-semibold">Redeem Meal Card</p>
        <div className="flex gap-2">
          <input value={redeemCode} onChange={(e) => setRedeemCode(e.target.value)} placeholder="Scan / enter code (MC-…)"
            className="flex-1 px-4 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <button onClick={handleRedeem} disabled={redeemMut.isPending}
            className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors">Redeem</button>
        </div>
      </CardContent></Card>

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
    </div>
  );
}
