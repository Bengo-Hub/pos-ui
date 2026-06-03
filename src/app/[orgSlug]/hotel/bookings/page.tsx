'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/base';
import { useRoomBookings, useCreateRoomBooking } from '@/hooks/useHotel';
import { usePermissions, P } from '@/hooks/usePermissions';
import type { CreateRoomBookingInput } from '@/lib/api/hotel';
import { ArrowLeft, Loader2, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

const inputCls = 'mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring';

function RoomBookingsPageInner() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const { data: bookings = [], isLoading } = useRoomBookings();
  const createMut = useCreateRoomBooking();
  const { can } = usePermissions();
  const canManage = can(P.HOTEL_MANAGE);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateRoomBookingInput>({
    lead_guest_name: '', email: '', phone: '', rooms_count: 1,
    arrival_date: '', departure_date: '', market_segment: '', source: 'staff',
  });
  function set<K extends keyof CreateRoomBookingInput>(k: K, v: CreateRoomBookingInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleCreate() {
    if (!form.lead_guest_name.trim()) { toast.error('Lead guest name is required'); return; }
    try {
      await createMut.mutateAsync({
        ...form,
        arrival_date: form.arrival_date ? new Date(form.arrival_date).toISOString() : new Date().toISOString(),
        departure_date: form.departure_date ? new Date(form.departure_date).toISOString() : new Date().toISOString(),
      });
      toast.success('Booking created');
      setShowForm(false);
    } catch { toast.error('Failed to create booking'); }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/${orgSlug}/hotel`} className="p-2 rounded-lg hover:bg-muted transition-colors"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex items-center gap-3 flex-1">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center"><Users className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Group Bookings</h1>
            <p className="text-sm text-muted-foreground">Multi-room reservations</p>
          </div>
        </div>
        {canManage && (
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> New Booking
          </button>
        )}
      </div>

      {showForm && canManage && (
        <Card><CardContent className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block col-span-2"><span className="text-sm font-medium">Lead Guest Name</span>
              <input value={form.lead_guest_name} onChange={(e) => set('lead_guest_name', e.target.value)} className={inputCls} /></label>
            <label className="block"><span className="text-sm font-medium">Email</span>
              <input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} className={inputCls} /></label>
            <label className="block"><span className="text-sm font-medium">Phone</span>
              <input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} className={inputCls} /></label>
            <label className="block"><span className="text-sm font-medium">Rooms</span>
              <input type="number" min={1} value={form.rooms_count} onChange={(e) => set('rooms_count', parseInt(e.target.value) || 1)} className={inputCls} /></label>
            <label className="block"><span className="text-sm font-medium">Market Segment</span>
              <input value={form.market_segment ?? ''} onChange={(e) => set('market_segment', e.target.value)} placeholder="corporate / ota / group" className={inputCls} /></label>
            <label className="block"><span className="text-sm font-medium">Arrival</span>
              <input type="datetime-local" value={form.arrival_date} onChange={(e) => set('arrival_date', e.target.value)} className={inputCls} /></label>
            <label className="block"><span className="text-sm font-medium">Departure</span>
              <input type="datetime-local" value={form.departure_date} onChange={(e) => set('departure_date', e.target.value)} className={inputCls} /></label>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-border font-medium hover:bg-muted transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={createMut.isPending} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {createMut.isPending ? 'Saving…' : 'Create Booking'}
            </button>
          </div>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : bookings.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No group bookings yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-medium">{b.lead_guest_name} <span className="text-xs text-muted-foreground">({b.confirmation_no})</span></p>
                  <p className="text-xs text-muted-foreground">
                    {b.rooms_count} room(s) · {new Date(b.arrival_date).toLocaleDateString()} → {new Date(b.departure_date).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground capitalize">{b.status}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>
    </div>
  );
}

export default function RoomBookingsPage() {
  return (
    <ModuleGate moduleKey="hotel" fallback={<ModuleUnavailablePage moduleKey="hotel" />}>
      <RoomBookingsPageInner />
    </ModuleGate>
  );
}
