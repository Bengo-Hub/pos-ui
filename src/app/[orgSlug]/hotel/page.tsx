'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/base';
import { useHotelRooms } from '@/hooks/useHotel';
import {
  BedDouble,
  Building2,
  CheckCircle,
  Loader2,
  Users,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  available:    { label: 'Available',    color: 'text-green-600 bg-green-500/10',  icon: CheckCircle },
  occupied:     { label: 'Occupied',     color: 'text-red-600 bg-red-500/10',      icon: Users },
  cleaning:     { label: 'Cleaning',     color: 'text-blue-600 bg-blue-500/10',    icon: BedDouble },
  maintenance:  { label: 'Maintenance',  color: 'text-amber-600 bg-amber-500/10',  icon: Wrench },
  reserved:     { label: 'Reserved',     color: 'text-purple-600 bg-purple-500/10', icon: BedDouble },
};

function HotelPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;

  const { data: rooms = [], isLoading } = useHotelRooms();

  const summary = {
    available:   rooms.filter((r) => r.status === 'available').length,
    occupied:    rooms.filter((r) => r.status === 'occupied').length,
    cleaning:    rooms.filter((r) => r.status === 'cleaning').length,
    maintenance: rooms.filter((r) => r.status === 'maintenance').length,
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Hotel</h1>
        <p className="text-sm text-muted-foreground mt-1">Room status and facilities overview</p>
      </div>

      {/* Occupancy KPIs */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Object.entries({
            available: summary?.available ?? 0,
            occupied: summary?.occupied ?? 0,
            cleaning: summary?.cleaning ?? 0,
            maintenance: summary?.maintenance ?? 0,
          }).map(([status, count]) => {
            const cfg = statusConfig[status];
            const Icon = cfg.icon;
            return (
              <Card key={status}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={cn('size-10 rounded-xl flex items-center justify-center', cfg.color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{count}</p>
                    <p className="text-xs text-muted-foreground">{cfg.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href={`/${orgSlug}/hotel/rooms`}
          className="group flex items-center gap-4 p-5 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all"
        >
          <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <BedDouble className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Rooms</p>
            <p className="text-sm text-muted-foreground">Check-in, check-out, folio</p>
          </div>
        </Link>

        <Link
          href={`/${orgSlug}/hotel/facilities`}
          className="group flex items-center gap-4 p-5 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all"
        >
          <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Facilities</p>
            <p className="text-sm text-muted-foreground">Pool, gym, conference bookings</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

export default function HotelPageGated() {
  return (
    <ModuleGate moduleKey="hotel" fallback={<ModuleUnavailablePage moduleKey="hotel" />}>
      <HotelPage />
    </ModuleGate>
  );
}
