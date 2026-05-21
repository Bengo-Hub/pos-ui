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
  Circle,
  Clock,
  Globe,
  Loader2,
  MonitorPlay,
  PhoneCall,
  PlayCircle,
  Utensils,
  Wifi,
} from 'lucide-react';
import { useState } from 'react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function elapsedMinutes(receivedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(receivedAt).getTime()) / 60_000));
}

function timerClasses(minutes: number): string {
  if (minutes > 15) return 'text-red-400 animate-pulse font-bold';
  if (minutes > 10) return 'text-amber-400 font-semibold';
  if (minutes > 5)  return 'text-yellow-300 font-medium';
  return 'text-emerald-400 font-medium';
}

function cardBorderClass(minutes: number, status: string): string {
  if (status === 'ready')       return 'border-emerald-500/70 bg-emerald-500/5 shadow-emerald-500/10';
  if (status === 'in_progress') return 'border-amber-400/70 bg-amber-400/5 shadow-amber-400/10';
  if (minutes > 15)             return 'border-red-500/50 bg-red-500/5 shadow-red-500/10';
  if (minutes > 10)             return 'border-yellow-500/50 bg-yellow-500/5';
  return 'border-border/50 bg-card/60';
}

// ─── Source Badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source?: OrderSource }) {
  if (source === 'online') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
        <Globe className="h-2.5 w-2.5" />
        Online
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold">
      <Utensils className="h-2.5 w-2.5" />
      POS
    </span>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:     { label: 'Pending',  cls: 'bg-muted text-muted-foreground border border-border' },
    in_progress: { label: 'Cooking',  cls: 'bg-amber-500/25 text-amber-300 border border-amber-500/40' },
    ready:       { label: 'Ready',    cls: 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40' },
    served:      { label: 'Served',   cls: 'bg-blue-500/25 text-blue-300 border border-blue-500/40' },
    voided:      { label: 'Voided',   cls: 'bg-red-500/25 text-red-300 border border-red-500/40' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-700 text-gray-300' };
  return (
    <span className={cn('text-[10px] px-2 py-0.5 rounded font-semibold', cls)}>{label}</span>
  );
}

// ─── Action Button ────────────────────────────────────────────────────────────

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
        'flex items-center justify-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl transition-all disabled:opacity-50 min-h-11 touch-manipulation active:scale-95',
        className
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

// ─── Item status dot ──────────────────────────────────────────────────────────

function ItemDot({ status }: { status?: string }) {
  if (status === 'done') return <Circle className="h-3 w-3 fill-emerald-400 text-emerald-400" />;
  if (status === 'skip') return <Circle className="h-3 w-3 fill-muted-foreground/40 text-muted-foreground/40" />;
  return <Circle className="h-3 w-3 fill-muted-foreground/20 text-muted-foreground/20" />;
}

// ─── Ticket Card ──────────────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: KDSTicket }) {
  const start      = useStartTicket();
  const ready      = useReadyTicket();
  const serve      = useServeTicket();
  const callWaiter = useCallWaiter();

  const mins        = elapsedMinutes(ticket.received_at);
  const isPending   = ticket.status === 'pending';
  const isInProgress = ticket.status === 'in_progress';
  const isReady     = ticket.status === 'ready';

  return (
    <div className={cn(
      'flex flex-col rounded-2xl border-2 overflow-hidden transition-all shadow-lg',
      cardBorderClass(mins, ticket.status)
    )}>
      {/* Card header */}
      <div className="px-4 pt-4 pb-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl font-bold text-foreground font-display tracking-tight">
              #{ticket.order_number}
            </span>
            <SourceBadge source={ticket.order_source} />
            {ticket.order_label && (
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {ticket.order_label}
              </span>
            )}
          </div>
          <StatusBadge status={ticket.status} />
        </div>

        {/* Timer */}
        <div className={cn('flex items-center gap-1.5 text-xs', timerClasses(mins))}>
          <Clock className="h-3.5 w-3.5" />
          <span>{mins}m ago</span>
          {mins > 10 && <span className="text-[10px] opacity-80">— overdue</span>}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/50 mx-4" />

      {/* Item list */}
      <ul className="flex-1 px-4 py-3 space-y-2">
        {ticket.items.map((item, idx) => (
          <li key={item.line_id ?? idx} className="flex items-start gap-2">
            <ItemDot />
            <span className="font-bold text-foreground text-sm leading-none pt-0.5 shrink-0">
              {item.qty}×
            </span>
            <span className="text-foreground/80 text-sm leading-tight">{item.name}</span>
          </li>
        ))}
      </ul>

      {/* Action footer */}
      <div className="px-4 pb-4 pt-2 flex gap-2">
        {isPending && (
          <ActionButton
            icon={<PlayCircle className="h-4 w-4" />}
            label="Start"
            onClick={() => start.mutate(ticket.id)}
            loading={start.isPending}
            className="flex-1 bg-amber-500 hover:bg-amber-400 shadow-md shadow-amber-500/20"
          />
        )}
        {isInProgress && (
          <ActionButton
            icon={<CheckCircle className="h-4 w-4" />}
            label="Ready"
            onClick={() => ready.mutate(ticket.id)}
            loading={ready.isPending}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-500/20"
          />
        )}
        {isReady && (
          <ActionButton
            icon={<CheckCircle className="h-4 w-4" />}
            label="Served"
            onClick={() => serve.mutate(ticket.id)}
            loading={serve.isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20"
          />
        )}
        <ActionButton
          icon={<PhoneCall className="h-3.5 w-3.5" />}
          label="Waiter"
          onClick={() => callWaiter.mutate(ticket.id)}
          loading={callWaiter.isPending}
          className="bg-muted hover:bg-muted/80 text-muted-foreground shrink-0"
        />
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
      key={v}
      onClick={() => onChange(v)}
      className={cn(
        'flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl border transition-all min-h-11 touch-manipulation whitespace-nowrap',
        value === v
          ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
          : 'bg-card text-muted-foreground border-border hover:border-border/80 hover:text-foreground'
      )}
    >
      {icon}
      {label}
      <span className={cn(
        'ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold',
        value === v ? 'bg-white/20' : 'bg-muted text-muted-foreground'
      )}>
        {count}
      </span>
    </button>
  );

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
      {btn('all',    'All Orders',    posCnt + onlineCnt, <ChefHat className="h-3.5 w-3.5" />)}
      {btn('pos',    'POS / Dine-in', posCnt,             <Utensils className="h-3.5 w-3.5" />)}
      {btn('online', 'Online Orders', onlineCnt,          <Globe className="h-3.5 w-3.5" />)}
    </div>
  );
}

// ─── Station Tab ──────────────────────────────────────────────────────────────

function StationTab({
  station,
  activeCount,
  isSelected,
  onClick,
}: {
  station: KDSStation;
  activeCount: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-5 py-3 rounded-xl border transition-all min-h-13 shrink-0 touch-manipulation',
        isSelected
          ? 'bg-muted border-border text-foreground shadow-md'
          : 'bg-card border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
      )}
    >
      <MonitorPlay className="h-4 w-4" />
      <span className="text-sm font-bold">{station.name}</span>
      <span className={cn(
        'text-[11px] font-bold px-2 py-0.5 rounded-full',
        activeCount > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      )}>
        {activeCount}
      </span>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KDSPage() {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [selectedStation, setSelectedStation] = useState<string | null>(null);

  const { data: stationsData, isLoading: stationsLoading } = useKDSStations();
  const { data: ticketsData, isLoading: ticketsLoading } = useKDSTickets();

  const stations: KDSStation[] = stationsData?.data ?? [];
  const allTickets: KDSTicket[] = ticketsData?.data ?? [];

  const isLoading = stationsLoading || ticketsLoading;

  const posCnt    = allTickets.filter((t) => t.order_source !== 'online').length;
  const onlineCnt = allTickets.filter((t) => t.order_source === 'online').length;

  const filteredTickets = allTickets.filter((t) => {
    if (sourceFilter === 'pos')    return t.order_source !== 'online';
    if (sourceFilter === 'online') return t.order_source === 'online';
    return true;
  });

  const activeStations = stations.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order);

  const ticketsForStation = (station: KDSStation) =>
    filteredTickets
      .filter((t) => t.station_id === station.id)
      .sort((a, b) => a.priority - b.priority || new Date(a.received_at).getTime() - new Date(b.received_at).getTime());

  // Active tickets for each station (not served/voided)
  const activeFor = (station: KDSStation) =>
    ticketsForStation(station).filter((t) => t.status !== 'served' && t.status !== 'voided');

  // Default to first station if none selected
  const currentStationId = selectedStation ?? activeStations[0]?.id ?? null;
  const currentStation = activeStations.find((s) => s.id === currentStationId);
  const currentTickets = currentStation ? activeFor(currentStation) : [];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* ── Top header bar ── */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border bg-background space-y-4">
        {/* Title + live badge + source filter */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-bold text-foreground font-display">Kitchen Display</h1>
              <p className="text-muted-foreground text-xs mt-0.5">Ticket board</p>
            </div>
            {/* Live badge */}
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <Wifi className="h-3 w-3" />
              Live
            </span>
          </div>
          <SourceFilterBar
            value={sourceFilter}
            onChange={setSourceFilter}
            posCnt={posCnt}
            onlineCnt={onlineCnt}
          />
        </div>

        {/* Station tabs */}
        {activeStations.length > 1 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
            {activeStations.map((station) => (
              <StationTab
                key={station.id}
                station={station}
                activeCount={activeFor(station).length}
                isSelected={station.id === currentStationId}
                onClick={() => setSelectedStation(station.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Ticket grid ── */}
      <div className="flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground text-sm">Loading tickets…</p>
          </div>
        ) : activeStations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
            <MonitorPlay className="h-16 w-16 opacity-15" />
            <div className="text-center">
              <p className="text-lg font-bold text-gray-500">No KDS stations configured</p>
              <p className="text-sm mt-1">Set up stations in Settings to use the Kitchen Display System.</p>
            </div>
          </div>
        ) : activeStations.length === 1 ? (
          /* Single station — responsive grid */
          <>
            {currentTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
                <div className="h-20 w-20 rounded-2xl border-2 border-dashed border-border flex items-center justify-center">
                  <ChefHat className="h-10 w-10 text-muted-foreground/30" />
                </div>
                <p className="text-muted-foreground font-medium">No active tickets</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {currentTickets.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
              </div>
            )}
          </>
        ) : (
          /* Multi-station — show selected station's tickets */
          <>
            {currentStation && (
              <div className="mb-4 flex items-center gap-2">
                <MonitorPlay className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-bold text-foreground/70 uppercase tracking-wider">{currentStation.name}</h2>
                <span className="text-xs text-muted-foreground ml-auto">
                  {currentTickets.length} ticket{currentTickets.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {currentTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
                <div className="h-20 w-20 rounded-2xl border-2 border-dashed border-border flex items-center justify-center">
                  <ChefHat className="h-10 w-10 text-muted-foreground/30" />
                </div>
                <p className="text-muted-foreground font-medium">No active tickets for this station</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {currentTickets.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
