'use client';

import { Badge, Button, Card, CardContent } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { useKDSStations, useKDSTickets, useBumpTicket } from '@/hooks/useKDS';
import type { KDSTicket, KDSStation } from '@/hooks/useKDS';
import {
  CheckCircle,
  Clock,
  Loader2,
  MonitorPlay,
} from 'lucide-react';
import { useState } from 'react';

function elapsedMinutes(createdAt: string): number {
  const diff = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(diff / 60_000));
}

function ticketColor(minutes: number): string {
  if (minutes > 15) return 'border-red-500/40 bg-red-500/5';
  if (minutes > 5) return 'border-yellow-500/40 bg-yellow-500/5';
  return 'border-green-500/40 bg-green-500/5';
}

function ticketBadgeVariant(minutes: number): 'success' | 'warning' | 'error' {
  if (minutes > 15) return 'error';
  if (minutes > 5) return 'warning';
  return 'success';
}

function StationColumn({ station, tickets }: { station: KDSStation; tickets: KDSTicket[] }) {
  const bump = useBumpTicket();

  return (
    <div className="flex-1 min-w-[280px] max-w-[360px]">
      <div className="flex items-center gap-2 mb-4 px-1">
        <MonitorPlay className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wider">{station.name}</h2>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {tickets.length}
        </Badge>
      </div>
      <div className="space-y-3">
        {tickets.map((ticket) => {
          const mins = elapsedMinutes(ticket.created_at);
          return (
            <Card
              key={ticket.id}
              className={cn('border-2 transition-all', ticketColor(mins))}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">#{ticket.order_number}</span>
                  <Badge variant={ticketBadgeVariant(mins)} className="text-[10px]">
                    <Clock className="h-3 w-3 mr-1 inline" />
                    {mins}m
                  </Badge>
                </div>
                <ul className="space-y-1">
                  {ticket.items.map((item) => (
                    <li key={item.id} className="flex items-start gap-2 text-sm">
                      <span className="font-bold text-foreground min-w-[20px]">{item.quantity}x</span>
                      <div>
                        <span>{item.name}</span>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            {item.modifiers.join(', ')}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={() => bump.mutate(ticket.id)}
                  disabled={bump.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-1.5" />
                  Bump
                </Button>
              </CardContent>
            </Card>
          );
        })}
        {tickets.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No active tickets
          </div>
        )}
      </div>
    </div>
  );
}

export default function KDSPage() {
  const { data: stationsData, isLoading: stationsLoading } = useKDSStations();
  const { data: ticketsData, isLoading: ticketsLoading } = useKDSTickets();

  const stations = stationsData?.data ?? [];
  const allTickets = ticketsData?.data ?? [];

  const isLoading = stationsLoading || ticketsLoading;

  // Group tickets by station
  const ticketsByStation = (station: KDSStation) =>
    allTickets
      .filter((t) => t.station_id === station.id && t.status !== 'bumped')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kitchen Display</h1>
        <p className="text-muted-foreground mt-1">
          Live ticket board — bump orders when ready.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : stations.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <MonitorPlay className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-bold">No KDS stations configured</p>
          <p className="text-sm">Set up stations in Settings to start using the Kitchen Display System.</p>
        </div>
      ) : (
        <div className="flex gap-6 overflow-x-auto pb-4">
          {stations
            .filter((s) => s.is_active)
            .sort((a, b) => a.display_order - b.display_order)
            .map((station) => (
              <StationColumn
                key={station.id}
                station={station}
                tickets={ticketsByStation(station)}
              />
            ))}
        </div>
      )}
    </div>
  );
}
