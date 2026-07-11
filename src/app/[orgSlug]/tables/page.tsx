'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { SeatGuestsModal } from '@/components/pos/seat-guests-modal';
import { HeldItemsPanel } from '@/components/pos/held-items-panel';
import { VoidBillButton } from '@/components/pos/void-bill-button';
import { SplitPaymentModal } from '@/components/pos/split-payment-modal';
import { PrintReceiptButton } from '@/components/pos/print-receipt-button';
import { POSPaymentModal } from '@/components/pos/payment-modal';
import { Badge, Button } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { useTables, useSections, useUpdateTableStatus, useReleaseTable, useMergeTables, useUnmergeTables, useOrders, useCategories } from '@/hooks/usePOS';
import { useKDSStations } from '@/hooks/useKDS';
import { usePermissions, P } from '@/hooks/usePermissions';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/api/client';
import {
  Calendar,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  CreditCard,
  GitMerge,
  Layers,
  Loader2,
  MapPin,
  Plus,
  ReceiptText,
  SplitSquareHorizontal,
  Shuffle,
  Table2,
  Users,
  X,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tableAgingClass(elapsedMinutes: number, maxMinutes: number): string {
  if (maxMinutes <= 0) return '';
  const ratio = elapsedMinutes / maxMinutes;
  if (ratio >= 1) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (ratio >= 0.7) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
}

function tableElapsedMinutes(occupiedSince: string): number {
  return Math.floor((Date.now() - new Date(occupiedSince).getTime()) / 60_000);
}

function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function fmt(amount: number): string {
  return `KSh ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { border: string; bg: string; badge: string; label: string; dot: string }> = {
  available:      { border: 'border-emerald-500', bg: 'bg-emerald-500/5',  badge: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400', label: 'Available',  dot: 'bg-emerald-500' },
  occupied:       { border: 'border-violet-500',  bg: 'bg-violet-500/5',   badge: 'bg-violet-500/20 text-violet-700 dark:text-violet-400',    label: 'Occupied',   dot: 'bg-violet-500'  },
  reserved:       { border: 'border-amber-500',   bg: 'bg-amber-500/5',    badge: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',        label: 'Reserved',   dot: 'bg-amber-500'   },
  cleaning:       { border: 'border-blue-500',    bg: 'bg-blue-500/5',     badge: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',           label: 'Cleaning',   dot: 'bg-blue-500'    },
  out_of_service: { border: 'border-gray-400',    bg: 'bg-gray-500/5',     badge: 'bg-muted text-muted-foreground',                           label: 'Out of Svc', dot: 'bg-gray-400'    },
};

function getStatusCfg(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.available;
}

// ─── Table Card ────────────────────────────────────────────────────────────────

interface TableCardProps {
  table: any;
  orgSlug: string;
  onSeatGuests: () => void;
  onRelease: () => void;
  onChangeStatus: (status: string) => void;
  onMerge: () => void;
  onUnmerge: () => void;
  releaseLoading: boolean;
  canChange: boolean;
  maxOccupationMinutes?: number;
  occupiedTables: any[];
  availableTables: any[];
}

function TableCard({
  table, orgSlug, onSeatGuests, onRelease, onChangeStatus, onMerge, onUnmerge,
  releaseLoading, canChange, maxOccupationMinutes = 0, occupiedTables, availableTables,
}: TableCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [transferMode, setTransferMode] = useState(false);
  const [unmergeMode, setUnmergeMode] = useState(false);
  const router = useRouter();
  const cfg = getStatusCfg(table.status);
  const isOccupied = table.status === 'occupied';
  const isMerged = !!table.order_id && table.metadata?.merged_from;

  const addToBillUrl = `/${orgSlug}/order?table_id=${table.id}&table_name=${encodeURIComponent(table.name)}&order_id=${table.order_id ?? ''}&order_total=${table.order_total ?? 0}&covers=${table.covers ?? 1}&mode=add_to_bill`;

  return (
    <>
      {/* Card face */}
      <div className={cn('relative flex flex-col p-3 rounded-2xl border-2 transition-all min-h-32 w-full gap-1', cfg.border, cfg.bg)}>
        {/* Status dot */}
        <span className={cn('absolute top-2.5 right-2.5 h-2.5 w-2.5 rounded-full', cfg.dot)} />

        {/* Table name — clickable to open action sheet */}
        <button
          onClick={() => setSheetOpen(true)}
          className="text-left flex-1 touch-manipulation active:scale-95"
        >
          <span className="text-2xl font-bold font-display leading-none block mb-0.5">{table.name}</span>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" />{table.capacity}s · {table.edges?.section?.name ?? table.section_name ?? 'Floor'}
          </span>
        </button>

        {/* Occupied info: order # + total */}
        {isOccupied && table.order_number && (
          <div className="mt-1">
            <p className="text-[11px] font-semibold text-primary leading-tight">
              {table.order_number} · {fmt(table.order_total ?? 0)}
            </p>
            {/* Aging badge */}
            {table.occupied_since && (() => {
              const elapsed = tableElapsedMinutes(table.occupied_since);
              const agingCls = tableAgingClass(elapsed, maxOccupationMinutes);
              return (
                <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5', agingCls || 'bg-muted text-muted-foreground')}>
                  <Clock className="h-2.5 w-2.5" />{formatElapsed(elapsed)}
                </span>
              );
            })()}
          </div>
        )}

        {/* CTA buttons */}
        {isOccupied && table.order_id ? (
          <button
            onClick={() => router.push(addToBillUrl)}
            className="mt-1 w-full text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-xl py-1.5 transition-colors touch-manipulation"
          >
            + Add to bill
          </button>
        ) : (
          table.status === 'available' && canChange && (
            <button
              onClick={onSeatGuests}
              className="mt-1 w-full text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl py-1.5 transition-colors touch-manipulation"
            >
              Seat guests
            </button>
          )
        )}
      </div>

      {/* Action sheet */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-sm"
          onClick={() => { setSheetOpen(false); setMergeMode(false); setTransferMode(false); setUnmergeMode(false); }}
        >
          <div
            className="w-full max-w-lg sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl pb-safe sm:pb-0 max-h-[88vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-2 sm:hidden">
              <div className="h-1 w-12 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className={cn('h-10 w-10 rounded-xl border-2 flex items-center justify-center font-bold text-lg', cfg.border, cfg.bg)}>
                  {table.name}
                </div>
                <div>
                  <p className="font-bold">{table.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className={cn('h-2 w-2 rounded-full', cfg.dot)} />
                    {cfg.label} · {table.capacity} seats
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setSheetOpen(false); setMergeMode(false); setTransferMode(false); setUnmergeMode(false); }}
                className="h-9 w-9 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-2.5">
              {/* Merge mode: pick secondary table */}
              {mergeMode && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold px-1">Select table to merge into {table.name}:</p>
                  {occupiedTables.filter((t) => t.id !== table.id).length === 0 && (
                    <p className="text-xs text-muted-foreground px-1">No other occupied tables.</p>
                  )}
                  {occupiedTables.filter((t) => t.id !== table.id).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        onMerge();
                        setMergeMode(false);
                        setSheetOpen(false);
                      }}
                      className="w-full text-left px-4 py-3 rounded-xl border border-border hover:bg-accent/30 text-sm font-semibold flex justify-between"
                    >
                      <span>{t.name}</span>
                      <span className="text-muted-foreground text-xs">{t.order_number} · {fmt(t.order_total ?? 0)}</span>
                    </button>
                  ))}
                  <button onClick={() => setMergeMode(false)} className="w-full text-sm text-muted-foreground py-2">Cancel</button>
                </div>
              )}

              {/* Transfer mode: pick available table */}
              {transferMode && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold px-1">Transfer {table.name} to:</p>
                  {availableTables.length === 0 && (
                    <p className="text-xs text-muted-foreground px-1">No available tables.</p>
                  )}
                  {availableTables.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        router.push(`/${orgSlug}/tables`); // trigger transfer via API (wired in parent)
                        setTransferMode(false);
                        setSheetOpen(false);
                      }}
                      className="w-full text-left px-4 py-3 rounded-xl border border-border hover:bg-accent/30 text-sm font-semibold"
                    >
                      {t.name} ({t.capacity} seats)
                    </button>
                  ))}
                  <button onClick={() => setTransferMode(false)} className="w-full text-sm text-muted-foreground py-2">Cancel</button>
                </div>
              )}

              {/* Normal actions */}
              {!mergeMode && !transferMode && !unmergeMode && (
                <>
                  {/* New order / seat guests */}
                  {canChange && !isOccupied && (
                    <button
                      onClick={() => { setSheetOpen(false); onSeatGuests(); }}
                      className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-colors min-h-14 touch-manipulation"
                    >
                      <Users className="h-5 w-5 text-primary" />
                      <div className="text-left">
                        <p className="font-bold text-sm">Seat Guests</p>
                        <p className="text-xs text-muted-foreground">Set guest count and start order</p>
                      </div>
                    </button>
                  )}

                  {/* Add to bill */}
                  {isOccupied && table.order_id && (
                    <button
                      onClick={() => { setSheetOpen(false); router.push(addToBillUrl); }}
                      className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-colors min-h-14 touch-manipulation"
                    >
                      <ClipboardList className="h-5 w-5 text-primary" />
                      <div className="text-left">
                        <p className="font-bold text-sm">Add Items to Bill</p>
                        <p className="text-xs text-muted-foreground">{table.order_number} · {fmt(table.order_total ?? 0)}</p>
                      </div>
                    </button>
                  )}

                  {/* View order */}
                  {isOccupied && (
                    <button
                      onClick={() => { setSheetOpen(false); router.push(`/${orgSlug}/orders?table_id=${table.id}`); }}
                      className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border-2 border-amber-500 bg-amber-500/5 hover:bg-amber-500/10 transition-colors min-h-14 touch-manipulation"
                    >
                      <ReceiptText className="h-5 w-5 text-amber-600" />
                      <div className="text-left">
                        <p className="font-bold text-sm text-amber-700 dark:text-amber-400">View / Manage Bill</p>
                        <p className="text-xs text-muted-foreground">Open the current bill for this table</p>
                      </div>
                    </button>
                  )}

                  {/* Reserve */}
                  {canChange && !isOccupied && (
                    <button
                      onClick={() => { setSheetOpen(false); router.push(`/${orgSlug}/reservations?table_id=${table.id}&table_name=${encodeURIComponent(table.name)}`); }}
                      className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border-2 border-amber-400 bg-amber-400/5 hover:bg-amber-400/10 transition-colors min-h-14 touch-manipulation"
                    >
                      <Calendar className="h-5 w-5 text-amber-600" />
                      <div className="text-left">
                        <p className="font-bold text-sm text-amber-700 dark:text-amber-400">Reserve Table</p>
                        <p className="text-xs text-muted-foreground">Book for a future guest</p>
                      </div>
                    </button>
                  )}

                  {/* Merge */}
                  {canChange && isOccupied && (
                    <button
                      onClick={() => setMergeMode(true)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:bg-accent/30 transition-colors touch-manipulation"
                    >
                      <GitMerge className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Merge Table</span>
                    </button>
                  )}

                  {/* Unmerge (only if order came from a merge) */}
                  {canChange && isOccupied && isMerged && (
                    <button
                      onClick={() => setUnmergeMode(true)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:bg-accent/30 transition-colors touch-manipulation"
                    >
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Unmerge Table</span>
                    </button>
                  )}

                  {/* Transfer */}
                  {canChange && isOccupied && (
                    <button
                      onClick={() => setTransferMode(true)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:bg-accent/30 transition-colors touch-manipulation"
                    >
                      <Shuffle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Transfer Table</span>
                    </button>
                  )}

                  {/* Change status grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {['available', 'occupied', 'reserved', 'cleaning'].map((s) => {
                      const sc = getStatusCfg(s);
                      const isActive = table.status === s;
                      return (
                        <button
                          key={s}
                          onClick={() => { if (!canChange || isActive) return; onChangeStatus(s); setSheetOpen(false); }}
                          disabled={isActive || !canChange}
                          className={cn(
                            'flex items-center gap-2 px-3 py-3 rounded-xl border-2 transition-all min-h-13 touch-manipulation',
                            isActive ? cn(sc.border, sc.bg, 'cursor-default') : !canChange ? 'border-border opacity-40 cursor-not-allowed' : 'border-border hover:border-primary/30 hover:bg-accent/30'
                          )}
                        >
                          <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', sc.dot)} />
                          <span className="text-sm font-semibold capitalize">{sc.label}</span>
                          {isActive && <span className="ml-auto text-[10px] text-muted-foreground">Current</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Release */}
                  {isOccupied && canChange && (
                    <Button
                      variant="outline"
                      className="w-full min-h-13 border-destructive/30 text-destructive hover:bg-destructive/10 gap-2"
                      onClick={() => { onRelease(); setSheetOpen(false); }}
                      disabled={releaseLoading}
                    >
                      {releaseLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                      Release Table
                    </Button>
                  )}

                  {!canChange && (
                    <p className="text-center text-xs text-muted-foreground pt-1">View only — no table management permission</p>
                  )}
                </>
              )}
            </div>
            <div className="h-4" />
          </div>
        </div>
      )}
    </>
  );
}

// ─── My Bills tab ─────────────────────────────────────────────────────────────

// Build the terminal add-to-bill URL for an existing open order (adds more items to the same bill).
function buildAddToBillUrl(orgSlug: string, order: any): string {
  const tableId = order.table_id ?? order.metadata?.table_id ?? '';
  const tableName = order.table_reference ?? order.metadata?.table_name ?? '';
  const params = new URLSearchParams({
    order_id: order.id,
    order_total: String(order.total_amount ?? 0),
    covers: String(order.covers_count ?? 1),
    mode: 'add_to_bill',
  });
  if (tableId) params.set('table_id', tableId);
  if (tableName) params.set('table_name', tableName);
  return `/${orgSlug}/order?${params.toString()}`;
}

// Period options for the My Bills date filter. Ranges are computed in the browser's local
// time (the till's wall clock) and sent as YYYY-MM-DD; pos-api interprets those bounds in the
// tenant timezone, so the day matches the local calendar day regardless of server TZ.
type BillsPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function billsPeriodRange(
  period: BillsPeriod,
  customFrom: string,
  customTo: string,
): { from?: string; to?: string } {
  const now = new Date();
  const today = ymdLocal(now);
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      const s = ymdLocal(y);
      return { from: s, to: s };
    }
    case 'week': {
      // Current calendar week, Monday → today.
      const d = new Date(now);
      const dow = (d.getDay() + 6) % 7; // 0 = Monday
      d.setDate(now.getDate() - dow);
      return { from: ymdLocal(d), to: today };
    }
    case 'month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: ymdLocal(first), to: today };
    }
    case 'custom':
      return { from: customFrom || undefined, to: customTo || undefined };
    default:
      return { from: today, to: today };
  }
}

function MyBillsTab({ orgSlug }: { orgSlug: string }) {
  const [filter, setFilter] = useState<'active' | 'settled' | 'voided'>('active');
  // Default the date filter to today; KDS station + category default to "all".
  const [period, setPeriod] = useState<BillsPeriod>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [kdsStationId, setKdsStationId] = useState('');
  const [category, setCategory] = useState('');
  const { data: kdsStations } = useKDSStations();
  const { data: categories } = useCategories();
  const router = useRouter();
  const { can } = usePermissions();
  const user = useAuthStore((s) => s.user);
  const outlet = useAuthStore((s) => s.outlet);
  const queryClient = useQueryClient();
  const releaseTable = useReleaseTable();
  const [payOrder, setPayOrder] = useState<any | null>(null);
  const [splitOrder, setSplitOrder] = useState<any | null>(null);
  const isHospitality = ['hospitality', 'quick_service', 'hotel'].includes(
    (outlet?.use_case ?? (user as any)?.outlet_use_case ?? '').toLowerCase()
  );
  const viewOwnOnly = can(P.ORDERS_VIEW_OWN) && !can(P.ORDERS_VIEW);
  const staffId = viewOwnOnly ? ((user as any)?.staffId ?? (user as any)?.id) : undefined;

  const statusMap = {
    active: 'open,pending_payment',
    settled: 'completed',
    voided: 'voided,cancelled',
  };

  // 9 cards per page → 3 rows of 3 on wide screens.
  const PAGE_SIZE = 9;
  const [page, setPage] = useState(1);
  const selectFilter = (key: 'active' | 'settled' | 'voided') => { setFilter(key); setPage(1); };

  // Shared filter set (date range + KDS station + category) applied to every status bucket so the
  // tab counts and the visible list agree on the same scope. Recomputed when any filter changes.
  const range = useMemo(
    () => billsPeriodRange(period, customFrom, customTo),
    [period, customFrom, customTo],
  );
  const sharedFilters = useMemo(
    () => ({
      staffId,
      from: range.from,
      to: range.to,
      kdsStationId: kdsStationId || undefined,
      category: category || undefined,
    }),
    [staffId, range.from, range.to, kdsStationId, category],
  );
  // Any filter change returns the list to page 1.
  const resetPage = () => setPage(1);

  const { data: activeData } = useOrders(useMemo(() => ({ ...sharedFilters, status: 'open,pending_payment' }), [sharedFilters]));
  const { data: settledData } = useOrders(useMemo(() => ({ ...sharedFilters, status: 'completed' }), [sharedFilters]));
  const { data: voidedData } = useOrders(useMemo(() => ({ ...sharedFilters, status: 'voided,cancelled' }), [sharedFilters]));
  const { data: currentData, isLoading } = useOrders(
    useMemo(() => ({ ...sharedFilters, status: statusMap[filter], page, limit: PAGE_SIZE }), [sharedFilters, filter, page])
  );

  const activeCnt = activeData?.total ?? 0;
  const settledCnt = settledData?.total ?? 0;
  const voidedCnt = voidedData?.total ?? 0;
  const orders = currentData?.data ?? [];
  const total = currentData?.meta?.total ?? currentData?.total ?? orders.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border flex items-center justify-between">
        <h2 className="text-lg font-bold font-display">My Bills</h2>
        <Link
          href={`/${orgSlug}/shifts`}
          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
        >
          My Shifts →
        </Link>
      </div>

      {/* Sub-filters */}
      <div className="shrink-0 px-6 pt-3 pb-2 flex gap-2">
        {([
          { key: 'active',  label: 'Active',  count: activeCnt,  dot: 'bg-violet-500' },
          { key: 'settled', label: 'Settled', count: settledCnt, dot: 'bg-emerald-500' },
          { key: 'voided',  label: 'Voided',  count: voidedCnt,  dot: 'bg-red-500'    },
        ] as const).map(({ key, label, count, dot }) => (
          <button
            key={key}
            onClick={() => selectFilter(key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all',
              filter === key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', dot)} />
            {label}
            <span className={cn('text-xs ml-0.5', filter === key ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters: period + KDS station + category. Defaults to today. */}
      <div className="shrink-0 px-6 pb-2 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {([
            { key: 'today',     label: 'Today' },
            { key: 'yesterday', label: 'Yesterday' },
            { key: 'week',      label: 'This Week' },
            { key: 'month',     label: 'This Month' },
            { key: 'custom',    label: 'Custom' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setPeriod(key); resetPage(); }}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-semibold transition-all',
                period === key
                  ? 'bg-primary/90 text-primary-foreground shadow-sm'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => { setCustomFrom(e.target.value); resetPage(); }}
              className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-medium"
              aria-label="From date"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => { setCustomTo(e.target.value); resetPage(); }}
              className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-medium"
              aria-label="To date"
            />
          </div>
        )}

        <select
          value={kdsStationId}
          onChange={(e) => { setKdsStationId(e.target.value); resetPage(); }}
          className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground max-w-40"
          aria-label="Filter by KDS station"
        >
          <option value="">All stations</option>
          {(kdsStations?.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); resetPage(); }}
          className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground max-w-40"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {(categories ?? []).map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Orders list */}
      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-4">
        {/* Set-aside (held) items — claim for a new customer or void unclaimed ones before shift close. */}
        {filter === 'active' && <HeldItemsPanel compact />}
        {isLoading && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {!isLoading && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
            <ReceiptText className="h-10 w-10 opacity-20" />
            <p className="text-sm">No {filter} bills</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
        {orders.map((order: any) => {
          const tableName = order.metadata?.table_name ?? order.metadata?.table_number ?? '—';
          const itemCount = order.edges?.lines?.length ?? order.lines?.length ?? 0;
          const statusBadge =
            order.status === 'completed' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' :
            order.status === 'open' || order.status === 'pending_payment' ? 'bg-violet-500/15 text-violet-700 dark:text-violet-400' :
            'bg-red-500/15 text-red-700 dark:text-red-400';
          return (
            <div key={order.id} className="bg-card rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-bold text-sm">{order.order_number}</p>
                  <p className="text-xs text-muted-foreground">{tableName} · {order.covers_count ?? 1}p · {formatTime(order.created_at)}</p>
                </div>
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize', statusBadge)}>
                  {order.status === 'pending_payment' ? 'Pending' : order.status}
                </span>
              </div>
              {/* Line items */}
              {(order.edges?.lines ?? order.lines ?? []).slice(0, 4).map((line: any) => (
                <div key={line.id} className="flex justify-between text-xs text-muted-foreground py-0.5">
                  <span>{line.quantity}x {line.name}</span>
                  <span>KSh {(line.total_price ?? 0).toLocaleString()}</span>
                </div>
              ))}
              {itemCount > 4 && (
                <p className="text-[10px] text-muted-foreground mt-1">+{itemCount - 4} more items</p>
              )}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                <span className="font-bold text-sm text-primary">{fmt(order.total_amount ?? 0)}</span>
              </div>
              <div className="mt-2 space-y-2">
                {(order.status === 'open' || order.status === 'pending_payment') && can(P.ORDERS_ADD) && (
                  <Button
                    variant="outline"
                    className="w-full gap-2 justify-center"
                    onClick={() => router.push(buildAddToBillUrl(orgSlug, order))}
                  >
                    <Plus className="h-4 w-4" />
                    Add to Bill
                  </Button>
                )}
                {(order.status === 'open' || order.status === 'pending_payment') && can(P.PAYMENTS_ADD) && (
                  <Button
                    className="w-full gap-2 justify-center"
                    onClick={() => setPayOrder(order)}
                  >
                    <CreditCard className="h-4 w-4" />
                    Settle Bill
                    {(order.total_amount ?? 0) > 0 && (
                      <span className="ml-auto font-bold text-sm">{fmt(order.total_amount ?? 0)}</span>
                    )}
                  </Button>
                )}
                {(order.status === 'open' || order.status === 'pending_payment') && can(P.PAYMENTS_ADD) && (order.total_amount ?? 0) > 0 && (
                  <Button
                    variant="outline"
                    className="w-full gap-2 justify-center"
                    onClick={() => setSplitOrder(order)}
                  >
                    <SplitSquareHorizontal className="h-4 w-4" />
                    Split Order
                  </Button>
                )}
                <PrintReceiptButton
                  orderId={order.id}
                  label={order.status === 'completed' ? 'Print Receipt' : 'Print Bill'}
                  className="w-full justify-center"
                />
                {(order.status === 'open' || order.status === 'pending_payment') && (
                  <VoidBillButton
                    orderId={order.id}
                    orderNumber={order.order_number}
                    status={order.status}
                    className="w-full justify-center flex items-center gap-2 px-4 py-2 rounded-xl border border-destructive/40 text-destructive text-sm font-semibold hover:bg-destructive/5 transition-colors"
                    onVoided={() => queryClient.invalidateQueries({ queryKey: ['pos-orders'] })}
                  />
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="shrink-0 px-6 py-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {total} bill{total !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-sm font-semibold disabled:opacity-40 hover:bg-accent transition-colors"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-sm font-semibold disabled:opacity-40 hover:bg-accent transition-colors"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {payOrder && (
        <POSPaymentModal
          open={!!payOrder}
          onClose={() => setPayOrder(null)}
          orderId={payOrder.id}
          orderNumber={payOrder.order_number}
          total={payOrder.total_amount ?? 0}
          tenantSlug={orgSlug}
          isHospitality={isHospitality}
          onPaymentConfirmed={() => {
            const tableId = payOrder?.table_id ?? payOrder?.metadata?.table_id;
            setPayOrder(null);
            queryClient.invalidateQueries({ queryKey: ['pos-orders'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-recent-orders'] });
            // pos-api releases the table on order completion; refresh the grid to
            // reflect it. Also fire the explicit release when we know the table id.
            queryClient.invalidateQueries({ queryKey: ['pos-tables'] });
            if (tableId) {
              releaseTable.mutate(tableId);
            }
          }}
        />
      )}

      {splitOrder && (
        <SplitPaymentModal
          open={!!splitOrder}
          onClose={() => setSplitOrder(null)}
          orderId={splitOrder.id}
          orderNumber={splitOrder.order_number}
          total={splitOrder.total_amount ?? 0}
          tenantId={user?.tenant_id ?? ''}
          tenantSlug={orgSlug}
          isHospitality={isHospitality}
          orderLines={(splitOrder.edges?.lines ?? splitOrder.lines ?? [])
            // Soft-voided lines (removed / set aside) are no longer payable — keep them out of the split.
            .filter((l: any) => l.voided_qty == null)
            .map((l: any) => ({
              id: l.id,
              name: l.name ?? l.item_name ?? 'Item',
              quantity: l.quantity ?? 1,
              unitPrice: l.unit_price ?? 0,
              totalPrice: l.total_price ?? l.line_total ?? (l.unit_price ?? 0) * (l.quantity ?? 1),
              seat: l.metadata?.seat, // pre-populate split from seat tagged at order-entry
            }))}
          onPaymentConfirmed={() => {
            setSplitOrder(null);
            queryClient.invalidateQueries({ queryKey: ['pos-orders'] });
            queryClient.invalidateQueries({ queryKey: ['pos-tables'] });
          }}
          onLinesChanged={async () => {
            // An item was replaced under this snapshot — refetch the order and swap it in place so
            // the split modal STAYS OPEN with the fresh line list (closing mid-flow was reported
            // as a bug). Fall back to closing only if the refetch fails.
            queryClient.invalidateQueries({ queryKey: ['pos-orders'] });
            queryClient.invalidateQueries({ queryKey: ['pos-tables'] });
            try {
              const fresh = await apiClient.get<any>(`/api/v1/${user?.tenant_id}/pos/orders/${splitOrder.id}`);
              setSplitOrder(fresh);
            } catch {
              setSplitOrder(null);
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TablesPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params?.orgSlug as string;
  const [activeTab, setActiveTab] = useState<'tables' | 'bills'>('tables');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [seatGuestsTable, setSeatGuestsTable] = useState<any | null>(null);

  const { canAny } = usePermissions();
  const canChange = canAny([P.TABLES_CHANGE, P.TABLES_CHANGE_OWN, P.TABLES_MANAGE]);

  const { data: tablesData, isLoading: tablesLoading } = useTables(undefined);
  const { data: sectionsData } = useSections();
  const { data: posSettings } = usePOSSettings();
  const maxOccupationMinutes = posSettings?.table_max_occupation_minutes ?? 0;

  const updateStatus = useUpdateTableStatus();
  const releaseTable = useReleaseTable();
  const mergeTables = useMergeTables();

  const allTables: any[] = tablesData?.data ?? [];
  const sections: any[] = sectionsData?.data ?? [];

  // Filtered tables (AND of section + status)
  const filteredTables = useMemo(() => {
    return allTables.filter((t) => {
      const sectionId = t.section_id || t.edges?.section?.id;
      const matchSection = sectionFilter === 'all' || sectionId === sectionFilter;
      const matchStatus = statusFilter === 'all' || t.status === statusFilter;
      return matchSection && matchStatus;
    });
  }, [allTables, sectionFilter, statusFilter]);

  const occupiedTables = allTables.filter((t) => t.status === 'occupied');
  const availableTables = allTables.filter((t) => t.status === 'available');

  const STATUS_FILTERS = [
    { value: 'all',       label: 'All',       dot: '' },
    { value: 'available', label: 'Available', dot: 'bg-emerald-500' },
    { value: 'occupied',  label: 'Occupied',  dot: 'bg-violet-500'  },
    { value: 'reserved',  label: 'Reserved',  dot: 'bg-amber-500'   },
    { value: 'cleaning',  label: 'Cleaning',  dot: 'bg-blue-500'    },
  ];

  const handleSeatGuests = (guestCount: number) => {
    if (!seatGuestsTable) return;
    setSeatGuestsTable(null);
    router.push(`/${orgSlug}/order?table_id=${seatGuestsTable.id}&table_name=${encodeURIComponent(seatGuestsTable.name)}&covers=${guestCount}`);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="shrink-0 flex border-b border-border bg-background">
        <button
          onClick={() => setActiveTab('tables')}
          className={cn(
            'flex items-center gap-2 px-6 py-3.5 text-sm font-semibold border-b-2 transition-colors',
            activeTab === 'tables'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Table2 className="h-4 w-4" />
          Tables
        </button>
        <button
          onClick={() => setActiveTab('bills')}
          className={cn(
            'flex items-center gap-2 px-6 py-3.5 text-sm font-semibold border-b-2 transition-colors',
            activeTab === 'bills'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <ReceiptText className="h-4 w-4" />
          My Bills
        </button>
      </div>

      {/* Tables tab */}
      {activeTab === 'tables' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Filter rows */}
          <div className="shrink-0 px-6 pt-4 pb-3 border-b border-border space-y-2.5">
            {/* Row 1: Section tabs */}
            <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
              <button
                onClick={() => setSectionFilter('all')}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 transition-all',
                  sectionFilter === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                )}
              >
                All
              </button>
              {sections.map((sec: any) => (
                <button
                  key={sec.id}
                  onClick={() => setSectionFilter(sec.id)}
                  className={cn(
                    'px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 transition-all',
                    sectionFilter === sec.id ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {sec.name}
                </button>
              ))}
            </div>

            {/* Row 2: Status pills */}
            <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
              {STATUS_FILTERS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStatusFilter(opt.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all',
                    statusFilter === opt.value ? 'bg-foreground/10 text-foreground shadow-sm border border-foreground/20' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {opt.dot && <span className={cn('h-2 w-2 rounded-full', opt.dot)} />}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table grid */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {tablesLoading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading tables…</p>
              </div>
            ) : filteredTables.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
                <Table2 className="h-14 w-14 opacity-20" />
                <p className="text-sm">No tables match the selected filters</p>
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {filteredTables.map((table: any) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    orgSlug={orgSlug}
                    onSeatGuests={() => setSeatGuestsTable(table)}
                    onRelease={() => releaseTable.mutate(table.id)}
                    onChangeStatus={(status) => updateStatus.mutate({ tableId: table.id, status })}
                    onMerge={() => {}}
                    onUnmerge={() => {}}
                    releaseLoading={releaseTable.isPending}
                    canChange={canChange}
                    maxOccupationMinutes={maxOccupationMinutes}
                    occupiedTables={occupiedTables}
                    availableTables={availableTables}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* My Bills tab */}
      {activeTab === 'bills' && <MyBillsTab orgSlug={orgSlug} />}

      {/* Seat guests modal */}
      {seatGuestsTable && (
        <SeatGuestsModal
          tableName={seatGuestsTable.name}
          tableCapacity={seatGuestsTable.capacity}
          onConfirm={handleSeatGuests}
          onBack={() => setSeatGuestsTable(null)}
        />
      )}
    </div>
  );
}

export default function TablesPageGated() {
  return (
    <ModuleGate moduleKey="tables" fallback={<ModuleUnavailablePage moduleKey="tables" />}>
      <TablesPage />
    </ModuleGate>
  );
}
