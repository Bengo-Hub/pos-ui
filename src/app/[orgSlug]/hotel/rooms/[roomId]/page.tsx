'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useHotelRoom, useRoomFolio, useCheckIn, useCheckOut, useLateCheckout } from '@/hooks/useHotel';
import { Card, CardContent } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  BedDouble,
  Clock,
  Loader2,
  LogIn,
  LogOut,
  Receipt,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

function RoomDetailPageInner() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const roomId = params?.roomId as string;
  const router = useRouter();

  const [checkInForm, setCheckInForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    nationality: '', id_type: 'national_id', id_number: '', id_document_url: '',
    adults: '1', children: '0',
    expected_arrival_at: '', expected_departure_at: '', nights: '1',
  });
  const [showCheckIn, setShowCheckIn] = useState(false);

  function setField(key: keyof typeof checkInForm, value: string) {
    setCheckInForm((f) => ({ ...f, [key]: value }));
  }

  const { data: room, isLoading: roomLoading } = useHotelRoom(roomId);
  const isOccupied = room?.status === 'occupied';
  const guest = room?.edges?.guests?.[0] ?? null;
  const { data: folio = [] } = useRoomFolio(roomId, isOccupied);

  const checkIn  = useCheckIn(roomId);
  const checkOut = useCheckOut(roomId);
  const lateCheckout = useLateCheckout(roomId);
  const [showLate, setShowLate] = useState(false);
  const [lateForm, setLateForm] = useState({ surcharge_amount: 0, notes: '' });

  async function handleLateCheckout() {
    try {
      await lateCheckout.mutateAsync({ surcharge_amount: lateForm.surcharge_amount, notes: lateForm.notes || undefined });
      toast.success('Late checkout approved');
      setShowLate(false);
      setLateForm({ surcharge_amount: 0, notes: '' });
    } catch {
      toast.error('Failed to approve late checkout');
    }
  }

  async function handleCheckIn() {
    const f = checkInForm;
    const guestName = `${f.first_name} ${f.last_name}`.trim() || f.first_name;
    if (!guestName) { toast.error('Guest name is required'); return; }

    // Derive nights from the date pickers when both are provided.
    let nights = parseInt(f.nights) || 1;
    if (f.expected_arrival_at && f.expected_departure_at) {
      const ms = new Date(f.expected_departure_at).getTime() - new Date(f.expected_arrival_at).getTime();
      const d = Math.ceil(ms / 86_400_000);
      if (d > 0) nights = d;
    }
    const childrenCount = parseInt(f.children) || 0;
    try {
      await checkIn.mutateAsync({
        guest_name: guestName,
        first_name: f.first_name || undefined,
        last_name: f.last_name || undefined,
        email: f.email || undefined,
        phone: f.phone,
        nationality: f.nationality || undefined,
        id_type: f.id_type || undefined,
        id_number: f.id_number,
        id_document_url: f.id_document_url || undefined,
        adults: parseInt(f.adults) || 1,
        children: childrenCount,
        nights,
        expected_arrival_at: f.expected_arrival_at ? new Date(f.expected_arrival_at).toISOString() : undefined,
        expected_departure_at: f.expected_departure_at ? new Date(f.expected_departure_at).toISOString() : undefined,
        source: 'staff',
      });
      toast.success('Guest checked in');
      setShowCheckIn(false);
    } catch {
      toast.error('Check-in failed');
    }
  }

  async function handleCheckOut() {
    try {
      await checkOut.mutateAsync();
      toast.success('Guest checked out');
      router.push(`/${orgSlug}/hotel/rooms`);
    } catch {
      toast.error('Check-out failed');
    }
  }

  if (roomLoading || !room) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/${orgSlug}/hotel/rooms`} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BedDouble className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Room {room.room_number}</h1>
            <p className="text-sm text-muted-foreground capitalize">{room.room_type.replace('_', ' ')} · Floor {room.floor}</p>
          </div>
        </div>
        <span className={cn(
          'ml-auto text-xs px-3 py-1 rounded-full font-semibold capitalize',
          room.status === 'available' ? 'bg-green-500/10 text-green-700' :
          room.status === 'occupied' ? 'bg-red-500/10 text-red-700' :
          'bg-muted text-muted-foreground'
        )}>
          {room.status}
        </span>
      </div>

      {/* Guest info */}
      {isOccupied && guest && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Current Guest</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: 'Name', value: [guest.first_name, guest.last_name].filter(Boolean).join(' ') || guest.guest_name },
                { label: 'Email', value: guest.email || '—' },
                { label: 'Phone', value: guest.phone },
                { label: 'Nationality', value: guest.nationality || '—' },
                { label: guest.id_type ? guest.id_type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'ID', value: guest.id_number },
                { label: 'Guests', value: `${guest.adults ?? 1} adult(s)${(guest.children ?? 0) > 0 ? `, ${guest.children} child(ren)` : ''}` },
                { label: 'Check-In', value: new Date(guest.expected_arrival_at || guest.check_in_date).toLocaleString() },
                { label: 'Check-Out', value: new Date(guest.expected_departure_at || guest.check_out_date).toLocaleString() },
                { label: 'Nights', value: String(guest.nights) },
                { label: 'Room Total', value: `KES ${guest.total_room_charge.toLocaleString()}`, highlight: true },
              ].map(({ label, value, highlight }) => (
                <div key={label}>
                  <p className="text-muted-foreground">{label}</p>
                  <p className={cn('font-semibold', highlight ? 'text-primary' : 'text-foreground')}>{value}</p>
                </div>
              ))}
            </div>
            {guest.id_document_url && (
              <a href={guest.id_document_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <Receipt className="h-3 w-3" /> View ID document
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {/* Folio */}
      {isOccupied && folio.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Room Folio</p>
            </div>
            <ul className="divide-y divide-border">
              {folio.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-foreground">{item.description}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {item.charge_type.replace('_', ' ')}
                      {item.inventory_sku ? ` · ${item.inventory_sku}` : ''}
                    </p>
                  </div>
                  <p className="font-semibold text-foreground">KES {item.amount.toLocaleString()}</p>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between pt-2 border-t border-border font-bold text-foreground">
              <span>Total</span>
              <span className="text-primary">KES {folio.reduce((s, i) => s + i.amount, 0).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="space-y-3">
        {!isOccupied && !showCheckIn && (
          <button
            onClick={() => setShowCheckIn(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
          >
            <LogIn className="h-5 w-5" /> Check In Guest
          </button>
        )}

        {showCheckIn && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <p className="font-semibold text-foreground">Guest Check-In</p>

              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name" value={checkInForm.first_name} onChange={(v) => setField('first_name', v)} placeholder="First name" />
                <Field label="Last Name" value={checkInForm.last_name} onChange={(v) => setField('last_name', v)} placeholder="Last name" />
                <Field label="Email" type="email" value={checkInForm.email} onChange={(v) => setField('email', v)} placeholder="guest@email.com" />
                <Field label="Phone" value={checkInForm.phone} onChange={(v) => setField('phone', v)} placeholder="+254..." />
                <Field label="Nationality" value={checkInForm.nationality} onChange={(v) => setField('nationality', v)} placeholder="e.g. Kenyan" />
                <label className="block">
                  <span className="text-sm font-medium text-foreground">ID Type</span>
                  <select
                    value={checkInForm.id_type}
                    onChange={(e) => setField('id_type', e.target.value)}
                    className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="national_id">National ID</option>
                    <option value="passport">Passport</option>
                    <option value="driving_licence">Driving Licence</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <Field label="ID Number" value={checkInForm.id_number} onChange={(v) => setField('id_number', v)} placeholder="Document number" />
                <Field label="ID Document URL" value={checkInForm.id_document_url} onChange={(v) => setField('id_document_url', v)} placeholder="Uploaded scan link (optional)" />
                <Field label="Check-In Date & Time" type="datetime-local" value={checkInForm.expected_arrival_at} onChange={(v) => setField('expected_arrival_at', v)} />
                <Field label="Check-Out Date & Time" type="datetime-local" value={checkInForm.expected_departure_at} onChange={(v) => setField('expected_departure_at', v)} />
                <Field label="Adults" type="number" value={checkInForm.adults} onChange={(v) => setField('adults', v)} placeholder="1" />
                <Field label="Children" type="number" value={checkInForm.children} onChange={(v) => setField('children', v)} placeholder="0" />
                <Field label="Nights (if no dates)" type="number" value={checkInForm.nights} onChange={(v) => setField('nights', v)} placeholder="1" />
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowCheckIn(false)} className="flex-1 py-2.5 rounded-xl border border-border text-foreground font-medium hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleCheckIn}
                  disabled={checkIn.isPending || !checkInForm.first_name}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {checkIn.isPending ? 'Checking in…' : 'Confirm Check-In'}
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {isOccupied && (
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setShowLate(true)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-border font-semibold hover:bg-muted transition-colors"
            >
              <Clock className="h-5 w-5" />
              Late Checkout
            </button>
            <button
              onClick={handleCheckOut}
              disabled={checkOut.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90 disabled:opacity-50 transition-colors"
            >
              {checkOut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
              Check Out
            </button>
          </div>
        )}

        {showLate && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-sm" onClick={() => setShowLate(false)}>
            <div className="w-full max-w-sm sm:rounded-2xl rounded-t-2xl bg-card border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="text-base font-bold text-foreground">Approve Late Checkout</h2>
                <button type="button" onClick={() => setShowLate(false)} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Surcharge Amount ({room.currency ?? 'KES'})</span>
                  <input
                    type="number" min={0} step={0.01}
                    value={lateForm.surcharge_amount}
                    onChange={(e) => setLateForm((f) => ({ ...f, surcharge_amount: parseFloat(e.target.value) || 0 }))}
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes (optional)</span>
                  <input
                    value={lateForm.notes}
                    onChange={(e) => setLateForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="e.g. 2pm departure agreed"
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <p className="text-[11px] text-muted-foreground">The surcharge (if any) is posted to the guest&apos;s folio.</p>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowLate(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
                  <button
                    onClick={handleLateCheckout}
                    disabled={lateCheckout.isPending}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {lateCheckout.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Approve'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

export default function RoomDetailPage() {
  return (
    <ModuleGate moduleKey="hotel" fallback={<ModuleUnavailablePage moduleKey="hotel" />}>
      <RoomDetailPageInner />
    </ModuleGate>
  );
}
