'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { Badge } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { BedDouble, Loader2 } from 'lucide-react';

const POS_API = process.env.NEXT_PUBLIC_POS_API_URL || 'https://posapi.codevertexitsolutions.com';

interface Room {
  id: string;
  room_number: string;
  name: string;
  room_type: string;
  floor: number;
  rate_per_night: number;
  status: 'available' | 'occupied' | 'cleaning' | 'maintenance' | 'reserved' | 'checkout';
}

const statusColors: Record<string, string> = {
  available:   'bg-green-500/10 text-green-700 dark:text-green-400',
  occupied:    'bg-red-500/10 text-red-700 dark:text-red-400',
  cleaning:    'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  maintenance: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  reserved:    'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  checkout:    'bg-muted text-muted-foreground',
};

const STATUS_OPTIONS = ['all', 'available', 'occupied', 'cleaning', 'maintenance', 'reserved'];

export default function RoomsPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const token = useAuthStore((s) => s.session?.accessToken);
  const [filter, setFilter] = useState('all');

  const { data: rooms = [], isLoading } = useQuery<Room[]>({
    queryKey: ['hotel-rooms', orgSlug, filter],
    queryFn: async () => {
      const url = new URL(`${POS_API}/v1/${orgSlug}/hotel/rooms`);
      if (filter !== 'all') url.searchParams.set('status', filter);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to fetch rooms');
      const data = await res.json();
      return data.rooms ?? data ?? [];
    },
    enabled: !!token && !!orgSlug,
    refetchInterval: 30_000,
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rooms</h1>
          <p className="text-sm text-muted-foreground mt-1">{rooms.length} rooms</p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium capitalize transition-colors',
              filter === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {rooms.map((room) => (
            <Link
              key={room.id}
              href={`/${orgSlug}/hotel/rooms/${room.id}`}
              className="group block p-4 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="size-10 rounded-xl bg-muted flex items-center justify-center">
                  <BedDouble className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', statusColors[room.status])}>
                  {room.status}
                </span>
              </div>
              <p className="font-bold text-foreground text-lg">{room.room_number}</p>
              <p className="text-xs text-muted-foreground capitalize">{room.room_type.replace('_', ' ')} · Floor {room.floor}</p>
              <p className="text-xs text-primary font-semibold mt-1">KES {room.rate_per_night.toLocaleString()}/night</p>
            </Link>
          ))}
        </div>
      )}

      {!isLoading && rooms.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <BedDouble className="h-12 w-12 opacity-30" />
          <p>No rooms found</p>
        </div>
      )}
    </div>
  );
}
