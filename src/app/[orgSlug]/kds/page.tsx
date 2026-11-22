'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { FeatureGate } from '@bengo-hub/shared-ui-lib/subscription';
import { FeatureLocked } from '@/components/auth/feature-locked';

import { Badge } from '@/components/ui/base';
import { cn, elapsedMinutes, formatElapsedClock } from '@/lib/utils';
import { useNow } from '@/hooks/useNow';
import { playKDSTone } from '@/lib/kds-sounds';
import { formatTime } from '@/lib/user-timezone';
import {
  useKDSStations,
  useKDSTickets,
  useKDSDaySummary,
  useStartTicket,
  useReadyTicket,
  useServeTicket,
  useCallWaiter,
  useClearBoard,
} from '@/hooks/useKDS';
import type { KDSTicket, KDSStation, KDSDaySummary, KDSHourBucket } from '@/hooks/useKDS';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { useKDSWebSocket } from '@/hooks/use-kds-ws';
import { useTenantId } from '@/hooks/useTenantId';
import { useEffectiveOutletID } from '@/hooks/usePOS';
import {
  activeStations,
  buildBoard,
  channelLabel,
  isActiveTicket,
  isClosedTicket,
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
  CalendarDays,
  CheckCircle,
  ChefHat,
  ChevronDown,
  Circle,
  Clock,
  Globe,
  Layers,
  ListChecks,
  Loader2,
  MonitorPlay,
  PhoneCall,
  PlayCircle,
  ShoppingBag,
  Snowflake,
  Trash2,
  Utensils,
  Wifi,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { usePermissions, P } from '@/hooks/usePermissions';
import type { KDSStationType } from '@/hooks/useKDS';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timerClasses(minutes: number): string {
  if (minutes > 15) return 'text-red-400 animate-pulse font-bold';
  if (minutes > 10) return 'text-amber-400 font-semibold';
  if (minutes > 5)  return 'text-yellow-300 font-medium';
  return 'text-emerald-400 font-medium';
}

function cardBorderClass(minutes: number, status: string): string {
  if (status === 'served' || status === 'voided') return 'border-border/40 bg-muted/30 shadow-none';
  if (status === 'ready')      return 'border-emerald-500/70 bg-emerald-500/5 shadow-emerald-500/10';
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
  const isClosed    = isClosedTicket(ticket);
  // A finished ticket's clock stops at the moment it left the pass (its prep time).
  const clockEnd    = isClosed && ticket.completed_at ? ticket.completed_at : now;
  const mins        = elapsedMinutes(ticket.received_at, clockEnd);
  const elapsedLabel = formatElapsedClock(ticket.received_at, clockEnd);
  const isPending   = ticket.status === 'pending';
  const isInProgress = ticket.status === 'in_progress';
  const isReady     = ticket.status === 'ready';

  return (
    <div className={cn(
      'relative flex flex-col rounded-2xl border-2 overflow-hidden transition-all shadow-lg',
      cardBorderClass(mins, ticket.status)
    )}>
      {/* Served or voided: crossed out but still readable, so the shift can be tallied. */}
      {isClosed && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <X className={cn('h-full w-full opacity-15', ticket.status === 'voided' ? 'text-red-500' : 'text-foreground')} strokeWidth={1.25} />
        </div>
      )}
      {/* Card header */}
      <div className={cn('px-4 pt-4 pb-3 space-y-2', isClosed && 'opacity-70')}>
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

        {/* Timer: live age while in the kitchen, the frozen prep time once finished. */}
        {isClosed ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-mono tabular-nums">{elapsedLabel}</span>
            <span className="text-[10px]">
              {ticket.status === 'voided' ? 'voided' : 'served'}
              {ticket.completed_at ? ` at ${formatTime(ticket.completed_at)}` : ''}
            </span>
          </div>
        ) : (
          <div className={cn('flex items-center gap-1.5 text-xs', timerClasses(mins))}>
            <Clock className="h-3.5 w-3.5" />
            <span className="font-mono tabular-nums">{elapsedLabel}</span>
            {mins > 10 && <span className="text-[10px] opacity-80">overdue</span>}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-border/50 mx-4" />

      {ticket.order_notes && (
        <p className="mx-4 mt-3 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-300">
          Note: {ticket.order_notes}
        </p>
      )}

      {/* Item list */}
      <ul className={cn('flex-1 px-4 py-3 space-y-2', isClosed && 'line-through decoration-2 decoration-foreground/40 opacity-70')}>
        {ticket.items.map((item, idx) => (
          <li key={item.line_id ?? idx} className="flex items-start gap-2">
            <ItemDot status={isClosed && ticket.status === 'served' ? 'done' : undefined} />
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
      {canChange && !isClosed && (
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

// ─── Day view: hourly strip and item tally ────────────────────────────────────
// Counts come from pos-api's SQL day summary, so they cover the whole day even when the card list
// is paged. All 24 hours always show; quiet hours are muted.

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function HourStrip({
  summary,
  hour,
  onChange,
}: {
  summary?: KDSDaySummary;
  hour: number | null;
  onChange: (h: number | null) => void;
}) {
  const hours: KDSHourBucket[] =
    summary?.hours ??
    Array.from({ length: 24 }, (_, h) => ({ hour: h, start: '', tickets: 0, active: 0, served: 0, voided: 0, items: 0, served_items: 0 }));
  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto scrollbar-none pb-0.5" role="tablist" aria-label="Hour of day">
      <button
        role="tab"
        aria-selected={hour === null}
        onClick={() => onChange(null)}
        className={cn(
          'shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold min-h-12 touch-manipulation',
          hour === null ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground',
        )}
      >
        All hours
        <span className="block text-[10px] font-bold opacity-80">{summary?.totals.tickets ?? 0} tickets</span>
      </button>
      {hours.map((b) => {
        const selected = hour === b.hour;
        const quiet = b.tickets === 0;
        return (
          <button
            key={b.hour}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(selected ? null : b.hour)}
            title={`${String(b.hour).padStart(2, '0')}:00 to ${String(b.hour).padStart(2, '0')}:59: ${b.tickets} tickets, ${fmtQty(b.items)} items, ${b.active} still open`}
            className={cn(
              'shrink-0 w-14 rounded-xl border px-1.5 py-1.5 text-center min-h-12 touch-manipulation transition-colors',
              selected
                ? 'bg-primary text-primary-foreground border-primary'
                : quiet
                  ? 'bg-card/40 text-muted-foreground/50 border-border/50'
                  : 'bg-card text-foreground border-border hover:border-primary/60',
            )}
          >
            <span className="block font-mono text-[11px] font-bold tabular-nums">{String(b.hour).padStart(2, '0')}:00</span>
            <span className="block text-[10px] tabular-nums">{b.tickets}</span>
            {b.active > 0 && !selected && <span className="mx-auto mt-0.5 block h-1 w-1 rounded-full bg-amber-400" aria-label="open tickets" />}
          </button>
        );
      })}
    </div>
  );
}

function ItemTallyPanel({ summary, hour, stationName }: { summary?: KDSDaySummary; hour: number | null; stationName?: string }) {
  const [open, setOpen] = useState(false);
  const items = summary?.items ?? [];
  const sum = items.reduce(
    (a, i) => ({ served: a.served + i.served, active: a.active + i.active, voided: a.voided + i.voided, total: a.total + i.total }),
    { served: 0, active: 0, voided: 0, total: 0 },
  );
  const scope = hour === null ? 'the whole day' : `${String(hour).padStart(2, '0')}:00 to ${String(hour).padStart(2, '0')}:59`;
  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold min-h-11 touch-manipulation"
      >
        <ListChecks className="h-4 w-4 text-primary" />
        Item tally
        <span className="text-xs font-normal text-muted-foreground truncate">
          {fmtQty(sum.served)} served · {fmtQty(sum.active)} open · {fmtQty(sum.voided)} voided, {scope}
          {stationName ? `, ${stationName}` : ''}
        </span>
        <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="max-h-80 overflow-auto border-t border-border">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No items in this window.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Item</th>
                  <th className="px-2 py-2 text-right font-semibold">Served</th>
                  <th className="px-2 py-2 text-right font-semibold">Open</th>
                  <th className="px-2 py-2 text-right font-semibold">Voided</th>
                  <th className="px-4 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {items.map((i) => (
                  <tr key={i.name} className="border-t border-border/50">
                    <td className="px-4 py-1.5">{i.name}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{fmtQty(i.served)}</td>
                    <td className="px-2 py-1.5 text-right text-amber-500">{i.active ? fmtQty(i.active) : ''}</td>
                    <td className="px-2 py-1.5 text-right text-red-500">{i.voided ? fmtQty(i.voided) : ''}</td>
                    <td className="px-4 py-1.5 text-right">{fmtQty(i.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border font-bold tabular-nums">
                <tr>
                  <td className="px-4 py-2">Total</td>
                  <td className="px-2 py-2 text-right">{fmtQty(sum.served)}</td>
                  <td className="px-2 py-2 text-right">{fmtQty(sum.active)}</td>
                  <td className="px-2 py-2 text-right">{fmtQty(sum.voided)}</td>
                  <td className="px-4 py-2 text-right">{fmtQty(sum.total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
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
  const { data: settings } = usePOSSettings();

  // View: the outlet's default (day unless an admin chose live), switchable on the board.
  const [viewChoice, setViewChoice] = useState<'day' | 'live' | null>(null);
  const view = viewChoice ?? settings?.kds_default_view ?? 'day';
  const isDay = view === 'day';
  const keepClosed = settings?.kds_keep_served ?? true;
  // Day view window: '' is today in the tenant zone (pos-api resolves it); hour null = all hours.
  const [date, setDate] = useState('');
  const [hour, setHour] = useState<number | null>(null);
  const isToday = date === '';

  const { data: stationsData, isLoading: stationsLoading } = useKDSStations();
  // Reload cadence from the outlet setting (60..300s, default 60). New and changed tickets arrive
  // at once over the KDS socket; the timer is the fallback when the socket is down.
  const refreshMs = Math.min(300, Math.max(60, settings?.kds_refresh_seconds ?? 60)) * 1000;
  const tenantId = useTenantId() ?? '';
  const outletId = useEffectiveOutletID() || undefined;
  useKDSWebSocket({ tenantID: tenantId, outletID: outletId });
  const { data: ticketsData, isLoading: ticketsLoading } = useKDSTickets(
    isDay
      ? { view: 'day', date: date || undefined, hour, refetchMs: isToday ? refreshMs : false }
      : { refetchMs: refreshMs },
  );

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
  const board = useMemo(
    () => buildBoard(allTickets, currentStationId, channel, { mode: view, keepClosed }),
    [allTickets, currentStationId, channel, view, keepClosed],
  );
  const activeTotal = board.chips[0]?.count ?? 0;

  // Hourly buckets and the item tally for the station being viewed (pos-api SQL summary).
  const { data: daySummary } = useKDSDaySummary({
    date: date || undefined,
    hour,
    stationId: currentStationId,
    refetchMs: isToday ? refreshMs : false,
    enabled: isDay,
  });
  // Tenant-local today from the server (pods run in UTC); remembered so a past date keeps the cap.
  const [todayDate, setTodayDate] = useState<string | undefined>(undefined);
  const serverToday = isToday ? daySummary?.date : undefined;
  useEffect(() => {
    if (serverToday) setTodayDate(serverToday);
  }, [serverToday]);

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
            {/* Live badge: polling only while the board shows today. */}
            {(!isDay || isToday) && (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Wifi className="h-3 w-3" />
                Live
              </span>
            )}
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

          {/* View switch and, in the day view, the day being shown. */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-xl border border-border bg-card p-0.5" role="tablist" aria-label="Board view">
              {([['day', 'Day'], ['live', 'Live only']] as const).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setViewChoice(id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold min-h-9 touch-manipulation',
                    view === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {isDay && (
              <label className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 min-h-10 text-xs">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="sr-only">Day</span>
                <input
                  type="date"
                  value={date || todayDate || ''}
                  max={todayDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDate(!v || v === todayDate ? '' : v);
                    setHour(null);
                  }}
                  className="bg-transparent py-1.5 font-mono text-xs outline-none"
                />
              </label>
            )}
            {isDay && !isToday && (
              <button
                onClick={() => { setDate(''); setHour(null); }}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-border text-muted-foreground hover:text-foreground min-h-10"
              >
                Today
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

        {/* Day view: every hour of the day (tap one to drill down) and the item tally. */}
        {isDay && liveStations.length > 0 && (
          <>
            <HourStrip summary={daySummary} hour={hour} onChange={setHour} />
            <ItemTallyPanel summary={daySummary} hour={hour} stationName={currentStation?.name} />
          </>
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
                  {isDay && ` · ${board.tickets.filter(isClosedTicket).length} done`}
                </span>
              </div>
            )}
            {isDay && ticketsData?.truncated && (
              <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">
                This day has more tickets than one screen holds; showing the earliest. Tap an hour to see all of it. The
                tally above counts every ticket.
              </p>
            )}
            {board.tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
                <div className="h-20 w-20 rounded-2xl border-2 border-dashed border-border flex items-center justify-center">
                  <ChefHat className="h-10 w-10 text-muted-foreground/30" />
                </div>
                <p className="text-muted-foreground font-medium">
                  {isDay
                    ? hour === null ? 'No tickets this day' : `No tickets between ${String(hour).padStart(2, '0')}:00 and ${String(hour).padStart(2, '0')}:59`
                    : channel === 'all' ? 'No active tickets' : `No ${channelLabel(channel).toLowerCase()} tickets`}
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
        description="This marks ALL active tickets as served at every station. The live view drops them; the day view keeps them, crossed out, in the tally. Use this when the kitchen has no device to bump tickets, or to clear stale ones. This cannot be undone."
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
      {/* The live display is a plan feature; station routing/configuration is not (see pos-api router). */}
      <FeatureGate feature="kds" fallback={<FeatureLocked feature="kds" label="Kitchen Display" />}>
        <KDSPage />
      </FeatureGate>
    </ModuleGate>
  );
}
