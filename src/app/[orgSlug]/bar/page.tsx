'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { cn } from '@/lib/utils';
import {
  useKDSStations,
  useKDSTickets,
  useStartTicket,
  useReadyTicket,
  useServeTicket,
} from '@/hooks/useKDS';
import type { KDSTicket, KDSStation } from '@/hooks/useKDS';
import {
  CheckCircle,
  Clock,
  Loader2,
  PlayCircle,
  Utensils,
  Wine,
} from 'lucide-react';

function elapsedMinutes(receivedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(receivedAt).getTime()) / 60_000));
}

function urgencyClass(minutes: number) {
  if (minutes >= 15) return 'border-red-500 bg-red-500/5';
  if (minutes >= 8) return 'border-amber-500 bg-amber-500/5';
  return 'border-border bg-card';
}

function timerClass(minutes: number) {
  if (minutes >= 15) return 'text-red-500 font-bold';
  if (minutes >= 8) return 'text-amber-500 font-semibold';
  return 'text-muted-foreground';
}

function BarDisplayPage() {
  const { data: stationsData } = useKDSStations();
  const stations: KDSStation[] = stationsData?.data ?? [];
  // Find bar station by name heuristic (no station_type field in the type)
  const barStation = stations.find((s) => s.name.toLowerCase().includes('bar')) ?? null;

  const { data: ticketsData, isLoading } = useKDSTickets(
    barStation ? { stationId: barStation.id } : undefined
  );
  const allTickets: KDSTicket[] = ticketsData?.data ?? [];
  const active = allTickets.filter((t) => t.status !== 'served' && t.status !== 'voided');

  const startTicket = useStartTicket();
  const readyTicket = useReadyTicket();
  const serveTicket = useServeTicket();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 min-h-screen bg-background">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Wine className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Bar Display</h1>
          <p className="text-xs text-muted-foreground">{active.length} active orders</p>
        </div>
      </div>

      {active.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
          <Utensils className="h-12 w-12 opacity-30" />
          <p className="font-medium">No active bar orders</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {active.map((ticket) => (
            <BarTicketCard
              key={ticket.id}
              ticket={ticket}
              onStart={() => startTicket.mutate(ticket.id)}
              onReady={() => readyTicket.mutate(ticket.id)}
              onServe={() => serveTicket.mutate(ticket.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BarTicketCard({
  ticket,
  onStart,
  onReady,
  onServe,
}: {
  ticket: KDSTicket;
  onStart: () => void;
  onReady: () => void;
  onServe: () => void;
}) {
  const elapsed = elapsedMinutes(ticket.received_at);

  return (
    <div className={cn('rounded-2xl border-2 p-4 space-y-3 transition-colors', urgencyClass(elapsed))}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-foreground">#{ticket.order_number}</p>
          {ticket.order_label && (
            <p className="text-xs text-muted-foreground">{ticket.order_label}</p>
          )}
        </div>
        <div className={cn('flex items-center gap-1 text-xs', timerClass(elapsed))}>
          <Clock className="h-3.5 w-3.5" />
          {elapsed}m
        </div>
      </div>

      <ul className="space-y-1">
        {ticket.items.map((item) => (
          <li key={item.line_id} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                'size-2 rounded-full shrink-0',
                item.kds_status === 'ready' ? 'bg-green-500' :
                item.kds_status === 'in_progress' ? 'bg-amber-500' : 'bg-muted-foreground/40'
              )}
            />
            <span className={cn('flex-1', item.kds_status === 'ready' && 'line-through text-muted-foreground')}>
              {item.qty}× {item.name}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex gap-2 pt-1">
        {ticket.status === 'pending' ? (
          <button
            onClick={onStart}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors"
          >
            <PlayCircle className="h-3.5 w-3.5" /> Start
          </button>
        ) : ticket.status === 'in_progress' ? (
          <button
            onClick={onReady}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 text-xs font-semibold hover:bg-green-500/20 transition-colors"
          >
            <CheckCircle className="h-3.5 w-3.5" /> Ready
          </button>
        ) : (
          <button
            onClick={onServe}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
          >
            <CheckCircle className="h-3.5 w-3.5" /> Served
          </button>
        )}
      </div>
    </div>
  );
}

export default function BarDisplayPageGated() {
  return (
    <ModuleGate moduleKey="kds" fallback={<ModuleUnavailablePage moduleKey="kds" />}>
      <BarDisplayPage />
    </ModuleGate>
  );
}
