'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { Card, CardContent } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  BedDouble,
  ChevronRight,
  Loader2,
  LogIn,
  LogOut,
  PlusCircle,
  Receipt,
} from 'lucide-react';
import Link from 'next/link';

const POS_API = process.env.NEXT_PUBLIC_POS_API_URL || 'https://posapi.codevertexitsolutions.com';

interface Room {
  id: string;
  room_number: string;
  name: string;
  room_type: string;
  floor: number;
  rate_per_night: number;
  status: string;
}

interface RoomGuest {
  id: string;
  guest_name: string;
  phone: string;
  id_number: string;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  total_room_charge: number;
  status: 'active' | 'checked_out';
}

interface FolioItem {
  id: string;
  description: string;
  amount: number;
  charge_type: string;
  created_at: string;
}

export default function RoomDetailPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const roomId = params?.roomId as string;
  const router = useRouter();
  const token = useAuthStore((s) => s.session?.accessToken);
  const qc = useQueryClient();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [checkInForm, setCheckInForm] = useState({ guest_name: '', phone: '', id_number: '', nights: '1' });
  const [showCheckIn, setShowCheckIn] = useState(false);

  const { data: room, isLoading: roomLoading } = useQuery<Room>({
    queryKey: ['room', orgSlug, roomId],
    queryFn: async () => {
      const res = await fetch(`${POS_API}/v1/${orgSlug}/hotel/rooms/${roomId}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch room');
      return res.json();
    },
    enabled: !!token && !!roomId,
  });

  const { data: guest } = useQuery<RoomGuest | null>({
    queryKey: ['room-guest', orgSlug, roomId],
    queryFn: async () => {
      const res = await fetch(`${POS_API}/v1/${orgSlug}/hotel/rooms/${roomId}/current-guest`, { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch guest');
      return res.json();
    },
    enabled: !!token && !!roomId,
  });

  const { data: folio = [] } = useQuery<FolioItem[]>({
    queryKey: ['room-folio', orgSlug, roomId],
    queryFn: async () => {
      const res = await fetch(`${POS_API}/v1/${orgSlug}/hotel/rooms/${roomId}/folio`, { headers });
      if (!res.ok) throw new Error('Failed to fetch folio');
      const data = await res.json();
      return data.items ?? data ?? [];
    },
    enabled: !!token && !!roomId && room?.status === 'occupied',
  });

  const checkIn = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${POS_API}/v1/${orgSlug}/hotel/rooms/${roomId}/check-in`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...checkInForm, nights: parseInt(checkInForm.nights) }),
      });
      if (!res.ok) throw new Error('Check-in failed');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room', orgSlug, roomId] });
      qc.invalidateQueries({ queryKey: ['room-guest', orgSlug, roomId] });
      qc.invalidateQueries({ queryKey: ['hotel-rooms', orgSlug] });
      setShowCheckIn(false);
    },
  });

  const checkOut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${POS_API}/v1/${orgSlug}/hotel/rooms/${roomId}/check-out`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) throw new Error('Check-out failed');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room', orgSlug, roomId] });
      qc.invalidateQueries({ queryKey: ['hotel-rooms', orgSlug] });
      router.push(`/${orgSlug}/hotel/rooms`);
    },
  });

  if (roomLoading || !room) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isOccupied = room.status === 'occupied';

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
              <div>
                <p className="text-muted-foreground">Name</p>
                <p className="font-semibold text-foreground">{guest.guest_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Phone</p>
                <p className="font-semibold text-foreground">{guest.phone}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Check-In</p>
                <p className="font-semibold text-foreground">{new Date(guest.check_in_date).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Check-Out</p>
                <p className="font-semibold text-foreground">{new Date(guest.check_out_date).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Nights</p>
                <p className="font-semibold text-foreground">{guest.nights}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Room Total</p>
                <p className="font-semibold text-primary">KES {guest.total_room_charge.toLocaleString()}</p>
              </div>
            </div>
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
                    <p className="text-xs text-muted-foreground capitalize">{item.charge_type.replace('_', ' ')}</p>
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
              {[
                { key: 'guest_name', label: 'Guest Name', placeholder: 'Full name' },
                { key: 'phone', label: 'Phone', placeholder: '+254...' },
                { key: 'id_number', label: 'ID / Passport', placeholder: 'Document number' },
                { key: 'nights', label: 'Nights', placeholder: '1', type: 'number' },
              ].map(({ key, label, placeholder, type }) => (
                <label key={key} className="block">
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  <input
                    type={type ?? 'text'}
                    value={(checkInForm as any)[key]}
                    onChange={(e) => setCheckInForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              ))}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowCheckIn(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-foreground font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => checkIn.mutate()}
                  disabled={checkIn.isPending || !checkInForm.guest_name}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {checkIn.isPending ? 'Checking in…' : 'Confirm Check-In'}
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {isOccupied && (
          <button
            onClick={() => checkOut.mutate()}
            disabled={checkOut.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90 disabled:opacity-50 transition-colors"
          >
            {checkOut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
            Check Out
          </button>
        )}
      </div>
    </div>
  );
}
