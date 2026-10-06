'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { Badge } from '@/components/ui/base';
import { cn, formatElapsed } from '@/lib/utils';
import { useNow } from '@/hooks/useNow';
import { playKDSTone } from '@/lib/kds-sounds';
import {
  useKDSStations,
  useKDSTickets,
  useStartTicket,
  useReadyTicket,
  useServeTicket,
  useCallWaiter,
  useClearBoard,
} from '@/hooks/useKDS';
import type { KDSTicket, KDSStation } from '@/hooks/useKDS';
import {
  activeStations,
  buildBoard,
  channelLabel,
  isActiveTicket,
  ticketChannel,
  type ChannelChip,
  type ChannelFilter,
  type KDSChannel,
} from '@/lib/kds/board';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  BedDouble,
  Beer,
  Bike,
  CheckCircle,
  ChefHat,
  Circle,
  Clock,
  Globe,
  Layers,
  Loader2,
  MonitorPlay,
  PhoneCall,
  PlayCircle,
  ShoppingBag,
  Snowflake,
  Trash2,
  Utensils,
  Wifi,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { usePermissions, P } from '@/hooks/usePermissions';
import type { KDSStationType } from '@/hooks/useKDS';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function elapsedMinutes(receivedAt: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(receivedAt).getTime()) / 60_000));
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

// ─── Channel Badge ────────────────────────────────────────────────────────────

const CHANNEL_STYLE: Record<KDSChannel, { icon: React.ReactNode; cls: string }> = {
  dine_in:         { icon: <Utensils className="h-2.5 w-2.5" />,    cls: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30' },
  takeaway:        { icon: <ShoppingBag className="h-2.5 w-2.5" />, cls: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30' },
  delivery:        { icon: <Bike className="h-2.5 w-2.5" />,        cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30' },
  online_pickup:   { icon: <Globe className="h-2.5 w-2.5" />,       cls: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30' },
  online_delivery: { icon: <Globe className="h-2.5 w-2.5" />,       cls: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30' },
  room_service:    { icon: <BedDouble className="h-2.5 w-2.5" />,   cls: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30' },
  bar_tab:         { icon: <Beer className="h-2.5 w-2.5" />,        cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' },
  retail:          { icon: <ShoppingBag className="h-2.5 w-2.5" />, cls: 'bg-muted text-muted-foreground border-border' },
  service_job:     { icon: <Layers className="h-2.5 w-2.5" />,      cls: 'bg-muted text-muted-foreground border-border' },
};

function ChannelBadge({ channel }: { channel: KDSChannel }) {
  const style = CHANNEL_STYLE[channel];
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border font-semibold', style.cls)}>
      {style.icon}
      {channelLabel(channel)}
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
  const { can }    = usePermissions();
  // Read-only viewers (e.g. waiters with pos.kds.view) can monitor the board
  // but cannot fire/bump tickets — only KDS_CHANGE holders see prep actions.
  const canChange  = can(P.KDS_CHANGE);

  const now         = useNow(1000); // live-ticking clock so the age timer counts up in real time
  const mins        = elapsedMinutes(ticket.received_at, now);
  const elapsedLabel = formatElapsed(now - new Date(ticket.received_at).getTime());
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
            <ChannelBadge channel={ticketChannel(ticket)} />
          </div>
          <StatusBadge status={ticket.status} />
        </div>

        {/* Where it goes: table/room/online route, and who to call for a counter handover. */}
        {(ticket.order_label || ticket.customer_name) && (
          <p className="text-sm font-semibold text-foreground/80 truncate">
            {[ticket.order_label, ticket.customer_name].filter(Boolean).join(' · ')}
          </p>
        )}

        {/* Timer */}
        <div className={cn('flex items-center gap-1.5 text-xs', timerClasses(mins))}>
          <Clock className="h-3.5 w-3.5" />
          <span>{elapsedLabel} ago</span>
          {mins > 10 && <span className="text-[10px] opacity-80">— overdue</span>}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/50 mx-4" />

      {ticket.order_notes && (
        <p className="mx-4 mt-3 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-300">
          Note: {ticket.order_notes}
        </p>
      )}

      {/* Item list */}
      <ul className="flex-1 px-4 py-3 space-y-2">
        {ticket.items.map((item, idx) => (
          <li key={item.line_id ?? idx} className="flex items-start gap-2">
            <ItemDot />
            <span className="font-bold text-foreground text-sm leading-none pt-0.5 shrink-0">
              {item.quantity ?? item.qty ?? 1}×
            </span>
            <span className="text-foreground/80 text-sm leading-tight">
              {item.name}
              {(item.modifiers?.length || item.notes) && (
                <span className="mt-0.5 block text-xs font-semibold text-amber-300">
                  {[item.modifiers?.join(', '), item.notes].filter(Boolean).join(' | ')}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* Action footer — only for staff who can transition tickets (KDS_CHANGE).
          Read-only viewers (waiters) see the board without prep controls. */}
      {canChange && (
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
            onClick={() => {
              playKDSTone(); // ring the configured tone to summon a waiter to this station
              callWaiter.mutate(ticket.id);
            }}
            loading={callWaiter.isPending}
            className="bg-muted hover:bg-muted/80 text-muted-foreground shrink-0"
          />
        </div>
      )}
    </div>
  );
}

// ─── Channel Filter ───────────────────────────────────────────────────────────
// The board's only order filter. Chips come from buildBoard, so each count is exactly the number of
// cards the chip shows at the station being viewed.

function ChannelFilterBar({
  chips,
  value,
  onChange,
}: {
  chips: ChannelChip[];
  value: ChannelFilter;
  onChange: (v: ChannelFilter) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5" role="tablist" aria-label="Order type">
      {chips.map((chip) => {
        const active = value === chip.key;
        return (
          <button
            key={chip.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(chip.key)}
            className={cn(
              'flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl border transition-all min-h-10 touch-manipulation whitespace-nowrap shrink-0',
              active
                ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
                : 'bg-card text-muted-foreground border-border hover:text-foreground',
            )}
          >
            {chip.key === 'all' ? <ChefHat className="h-3.5 w-3.5" /> : CHANNEL_STYLE[chip.key].icon}
            {chip.label}
            <span className={cn('ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold', active ? 'bg-primary-foreground/20' : 'bg-muted')}>
              {chip.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Station type helpers ─────────────────────────────────────────────────────

const STATION_TYPE_CONFIG: Record<KDSStationType, { icon: React.ReactNode; label: string; color: string }> = {
  kitchen: { icon: <ChefHat className="h-3.5 w-3.5" />, label: 'Kitchen', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  bar:     { icon: <Beer className="h-3.5 w-3.5" />,    label: 'Bar',     color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  cold:    { icon: <Snowflake className="h-3.5 w-3.5" />, label: 'Cold',  color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  expo:    { icon: <Layers className="h-3.5 w-3.5" />,  label: 'Expo',    color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  all:     { icon: <Layers className="h-3.5 w-3.5" />,  label: 'All',     color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
};

// Maps KDS role name fragments to the station_type they should default to.
const ROLE_STATION_TYPE: Record<string, KDSStationType> = {
  bar:     'bar',
  kitchen: 'kitchen',
  chef:    'kitchen',
  cook:    'kitchen',
  cold:    'cold',
  expo:    'expo',
};

function defaultStationTypeForRole(role: string | undefined): KDSStationType | null {
  if (!role) return null;
  const lower = role.toLowerCase();
  for (const [key, type] of Object.entries(ROLE_STATION_TYPE)) {
    if (lower.includes(key)) return type;
  }
  return null;
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
  const typeConfig = STATION_TYPE_CONFIG[station.station_type] ?? STATION_TYPE_CONFIG.kitchen;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all min-h-13 shrink-0 touch-manipulation',
        isSelected
          ? 'bg-muted border-border text-foreground shadow-md'
          : 'bg-card border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
      )}
    >
      <MonitorPlay className="h-4 w-4" />
      <span className="text-sm font-bold">{station.name}</span>
      {/* Station type chip */}
      <span className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border font-semibold', typeConfig.color)}>
        {typeConfig.icon}
        {typeConfig.label}
      </span>
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

function KDSPage() {
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const user = useAuthStore((s) => s.user);
  const { can } = usePermissions();
  const clearBoard = useClearBoard();

  const { data: stationsData, isLoading: stationsLoading } = useKDSStations();
  const { data: ticketsData, isLoading: ticketsLoading } = useKDSTickets();

  const stations: KDSStation[] = stationsData?.data ?? [];
  const allTickets: KDSTicket[] = ticketsData?.data ?? [];

  const isLoading = stationsLoading || ticketsLoading;

  const liveStations = useMemo(() => activeStations(stations), [stations]);

  // Role-aware default: a bar user opens on the bar station, kitchen staff on the kitchen.
  const roleDefaultStationId = useMemo(() => {
    const preferredType = defaultStationTypeForRole(user?.roles?.[0]);
    if (!preferredType) return null;
    return liveStations.find((s) => s.station_type === preferredType)?.id ?? null;
  }, [liveStations, user?.roles]);

  const currentStationId =
    (selectedStation && liveStations.some((s) => s.id === selectedStation) ? selectedStation : null) ??
    roleDefaultStationId ??
    liveStations[0]?.id ??
    null;
  const currentStation = liveStations.find((s) => s.id === currentStationId);

  // Every chip, tab count and card comes from this one pass over the ticket list.
  const board = useMemo(() => buildBoard(allTickets, currentStationId, channel), [allTickets, currentStationId, channel]);
  const activeTotal = board.chips[0]?.count ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* ── Top header bar ── */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border bg-background space-y-4">
        {/* Title + live badge */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-bold text-foreground font-display">Display Board</h1>
              <p className="text-muted-foreground text-xs mt-0.5">Kitchen · Bar · All stations</p>
            </div>
            {/* Live badge */}
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <Wifi className="h-3 w-3" />
              Live
            </span>
            {/* Manager: bulk-clear the board (serve all active tickets) — for printer-only kitchens
                with no device to bump tickets one by one, or to clear a cluttered board. */}
            {can(P.ORDERS_MANAGE) && allTickets.some(isActiveTicket) && (
              <button
                onClick={() => setConfirmClear(true)}
                disabled={clearBoard.isPending}
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
                title="Clear all active tickets"
              >
                <Trash2 className="h-3 w-3" />
                Clear board
              </button>
            )}
          </div>
        </div>

        {/* Station tabs: counts follow the selected order type. */}
        {liveStations.length > 1 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
            {liveStations.map((station) => (
              <StationTab
                key={station.id}
                station={station}
                activeCount={board.stationCounts[station.id] ?? 0}
                isSelected={station.id === currentStationId}
                onClick={() => setSelectedStation(station.id)}
              />
            ))}
          </div>
        )}

        {/* Order type for the station being viewed. */}
        <ChannelFilterBar chips={board.chips} value={channel} onChange={setChannel} />
      </div>

      {/* ── Ticket grid ── */}
      <div className="flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground text-sm">Loading tickets…</p>
          </div>
        ) : liveStations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
            <MonitorPlay className="h-16 w-16 opacity-15" />
            <div className="text-center">
              <p className="text-lg font-bold text-gray-500">No KDS stations configured</p>
              <p className="text-sm mt-1">Set up stations in Settings to use the Kitchen Display System.</p>
            </div>
          </div>
        ) : (
          <>
            {currentStation && (
              <div className="mb-4 flex items-center gap-2">
                <MonitorPlay className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-bold text-foreground/70 uppercase tracking-wider">{currentStation.name}</h2>
                <span className="text-xs text-muted-foreground ml-auto">
                  {board.tickets.length} of {activeTotal} ticket{activeTotal !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {board.tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
                <div className="h-20 w-20 rounded-2xl border-2 border-dashed border-border flex items-center justify-center">
                  <ChefHat className="h-10 w-10 text-muted-foreground/30" />
                </div>
                <p className="text-muted-foreground font-medium">
                  {channel === 'all' ? 'No active tickets' : `No ${channelLabel(channel).toLowerCase()} tickets`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {board.tickets.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear the board?"
        description="This marks ALL active tickets as served and removes them from every station. Use this when the kitchen has no device to bump tickets, or to clear stale ones. This cannot be undone."
        confirmLabel="Clear board"
        onConfirm={async () => {
          try {
            const res = await clearBoard.mutateAsync();
            toast.success(`Cleared ${res?.cleared ?? 0} ticket${res?.cleared === 1 ? '' : 's'}`);
          } catch {
            toast.error('Could not clear the board. Please try again.');
          } finally {
            setConfirmClear(false);
          }
        }}
      />
    </div>
  );
}

export default function KDSPageGated() {
  return (
    <ModuleGate moduleKey="kds" fallback={<ModuleUnavailablePage moduleKey="kds" />}>
      <KDSPage />
    </ModuleGate>
  );
}
