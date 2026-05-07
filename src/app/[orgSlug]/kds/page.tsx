'use client';

import { Badge } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import {
  useKDSStations,
  useKDSTickets,
  useStartTicket,
  useReadyTicket,
  useServeTicket,
  useCallWaiter,
} from '@/hooks/useKDS';
import type { KDSTicket, KDSStation, OrderSource } from '@/hooks/useKDS';
import {
  CheckCircle,
  ChefHat,
  Clock,
  Globe,
  Loader2,
  MonitorPlay,
  PhoneCall,
  PlayCircle,
  Utensils,
} from 'lucide-react';
import { useState } from 'react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function elapsedMinutes(receivedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(receivedAt).getTime()) / 60_000));
}

function timerClasses(minutes: number): string {
  if (minutes > 15) return 'text-red-500 animate-pulse font-bold';
  if (minutes > 10) return 'text-orange-400 font-semibold';
  return 'text-green-400';
}

function cardBorderClass(minutes: number, status: string): string {
  if (status === 'ready') return 'border-blue-500/60 bg-blue-500/5';
  if (status === 'in_progress') return 'border-orange-400/60 bg-orange-400/5';
  if (minutes > 15) return 'border-red-500/40 bg-red-500/5';
  if (minutes > 10) return 'border-yellow-500/40 bg-yellow-500/5';
  return 'border-gray-700 bg-gray-900/50';
}

// ─── Source Badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source?: OrderSource }) {
  if (source === 'online') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
        <Globe className="h-2.5 w-2.5" />
        Online
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
      <Utensils className="h-2.5 w-2.5" />
      POS
    </span>
  );
}

// ─── Ticket Card ──────────────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: KDSTicket }) {
  const start = useStartTicket();
  const ready = useReadyTicket();
  const serve = useServeTicket();
  const callWaiter = useCallWaiter();

  const mins = elapsedMinutes(ticket.received_at);
  const isPending = ticket.status === 'pending';
  const isInProgress = ticket.status === 'in_progress';
  const isReady = ticket.status === 'ready';

  return (
    <div className={cn('rounded-xl border-2 p-4 space-y-3 transition-all', cardBorderClass(mins, ticket.status))}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-white">#{ticket.order_number}</span>
            <SourceBadge source={ticket.order_source} />
            {ticket.order_label && (
              <span className="text-[10px] text-gray-400">{ticket.order_label}</span>
            )}
          </div>
          <div className={cn('text-xs mt-0.5 flex items-center gap-1', timerClasses(mins))}>
            <Clock className="h-3 w-3" />
            {mins}m ago
          </div>
        </div>
        <StatusBadge status={ticket.status} />
      </div>

      {/* Items */}
      <ul className="space-y-1.5">
        {ticket.items.map((item, idx) => (
          <li key={item.line_id ?? idx} className="flex items-start gap-2 text-sm">
            <span className="font-bold text-white min-w-6">{item.qty}×</span>
            <span className="text-gray-200">{item.name}</span>
          </li>
        ))}
      </ul>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {isPending && (
          <ActionButton
            icon={<PlayCircle className="h-3.5 w-3.5" />}
            label="Start"
            onClick={() => start.mutate(ticket.id)}
            loading={start.isPending}
            className="bg-orange-500 hover:bg-orange-400"
          />
        )}
        {isInProgress && (
          <ActionButton
            icon={<CheckCircle className="h-3.5 w-3.5" />}
            label="Ready"
            onClick={() => ready.mutate(ticket.id)}
            loading={ready.isPending}
            className="bg-blue-500 hover:bg-blue-400"
          />
        )}
        {isReady && (
          <ActionButton
            icon={<CheckCircle className="h-3.5 w-3.5" />}
            label="Served"
            onClick={() => serve.mutate(ticket.id)}
            loading={serve.isPending}
            className="bg-green-600 hover:bg-green-500"
          />
        )}
        <ActionButton
          icon={<PhoneCall className="h-3.5 w-3.5" />}
          label="Waiter"
          onClick={() => callWaiter.mutate(ticket.id)}
          loading={callWaiter.isPending}
          className="bg-gray-700 hover:bg-gray-600 ml-auto"
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-gray-700 text-gray-300' },
    in_progress: { label: 'Cooking', cls: 'bg-orange-500/30 text-orange-300' },
    ready: { label: 'Ready', cls: 'bg-blue-500/30 text-blue-300' },
    served: { label: 'Served', cls: 'bg-green-500/30 text-green-300' },
    voided: { label: 'Voided', cls: 'bg-red-500/30 text-red-300' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-700 text-gray-300' };
  return <span className={cn('text-[10px] px-2 py-0.5 rounded font-medium', cls)}>{label}</span>;
}

function ActionButton({
  icon,
  label,
  onClick,
  loading,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  loading?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50',
        className
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

// ─── Station Column ───────────────────────────────────────────────────────────

function StationColumn({ station, tickets }: { station: KDSStation; tickets: KDSTicket[] }) {
  const active = tickets.filter((t) => t.status !== 'served' && t.status !== 'voided');

  return (
    <div className="flex-1 min-w-75 max-w-95">
      <div className="flex items-center gap-2 mb-4 px-1">
        <MonitorPlay className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">{station.name}</h2>
        <span className="ml-auto text-[11px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full border border-gray-700">
          {active.length}
        </span>
      </div>
      <div className="space-y-3">
        {active.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
        {active.length === 0 && (
          <div className="text-center py-12 text-gray-600 text-sm border border-dashed border-gray-800 rounded-xl">
            No active tickets
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Source Filter Bar ────────────────────────────────────────────────────────

type SourceFilter = 'all' | OrderSource;

function SourceFilterBar({
  value,
  onChange,
  posCnt,
  onlineCnt,
}: {
  value: SourceFilter;
  onChange: (v: SourceFilter) => void;
  posCnt: number;
  onlineCnt: number;
}) {
  const btn = (v: SourceFilter, label: string, count: number, icon: React.ReactNode) => (
    <button
      onClick={() => onChange(v)}
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
        value === v
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500'
      )}
    >
      {icon}
      {label}
      <span className="ml-1 bg-black/30 px-1.5 py-0.5 rounded text-[10px]">{count}</span>
    </button>
  );

  return (
    <div className="flex items-center gap-2">
      {btn('all', 'All Orders', posCnt + onlineCnt, <ChefHat className="h-3.5 w-3.5" />)}
      {btn('pos', 'POS / Dine-in', posCnt, <Utensils className="h-3.5 w-3.5" />)}
      {btn('online', 'Online Orders', onlineCnt, <Globe className="h-3.5 w-3.5" />)}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KDSPage() {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  const { data: stationsData, isLoading: stationsLoading } = useKDSStations();
  const { data: ticketsData, isLoading: ticketsLoading } = useKDSTickets();

  const stations: KDSStation[] = stationsData?.data ?? [];
  const allTickets: KDSTicket[] = ticketsData?.data ?? [];

  const isLoading = stationsLoading || ticketsLoading;

  // Source counts for filter bar
  const posCnt = allTickets.filter((t) => t.order_source !== 'online').length;
  const onlineCnt = allTickets.filter((t) => t.order_source === 'online').length;

  // Apply source filter
  const filteredTickets = allTickets.filter((t) => {
    if (sourceFilter === 'pos') return t.order_source !== 'online';
    if (sourceFilter === 'online') return t.order_source === 'online';
    return true;
  });

  // Group by station
  const ticketsForStation = (station: KDSStation) =>
    filteredTickets
      .filter((t) => t.station_id === station.id)
      .sort((a, b) => a.priority - b.priority || new Date(a.received_at).getTime() - new Date(b.received_at).getTime());

  const activeStations = stations.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kitchen Display</h1>
          <p className="text-gray-500 text-sm mt-0.5">Live ticket board — auto-refreshes every 5s</p>
        </div>
        <SourceFilterBar
          value={sourceFilter}
          onChange={setSourceFilter}
          posCnt={posCnt}
          onlineCnt={onlineCnt}
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : activeStations.length === 0 ? (
        <div className="text-center py-24 text-gray-600">
          <MonitorPlay className="h-14 w-14 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-bold">No KDS stations configured</p>
          <p className="text-sm mt-1">Set up stations in Settings to start using the Kitchen Display System.</p>
        </div>
      ) : (
        <div className="flex gap-5 overflow-x-auto pb-4">
          {activeStations.map((station) => (
            <StationColumn
              key={station.id}
              station={station}
              tickets={ticketsForStation(station)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
