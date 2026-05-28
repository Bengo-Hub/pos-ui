'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/base';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle, Banknote, BarChart3, CalendarDays, Clock,
  CreditCard, DollarSign, History, Loader2, LogIn, LogOut,
  RefreshCw, ShoppingCart, TrendingDown,
} from 'lucide-react';
import {
  useCurrentShift, useOpenShift, useCloseShift,
  useSessionSummary, useShiftHistory,
} from '@/hooks/useShifts';
import { usePermissions, P } from '@/hooks/usePermissions';
import { ShiftCloseDialog } from '@/components/pos/shift-close-dialog';
import { ShiftPlannerPanel } from '@/components/pos/shift-planner-panel';
import { toast } from 'sonner';
import type { ShiftHistoryRow } from '@/lib/api/shifts';

type Tab = 'current' | 'history' | 'planner';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(start: string, end?: string): string {
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  const s = Math.floor((to - from) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function ElapsedTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    function tick() {
      const s = Math.floor((Date.now() - new Date(since).getTime()) / 1000);
      const h = Math.floor(s / 3600).toString().padStart(2, '0');
      const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
      const sec = (s % 60).toString().padStart(2, '0');
      setElapsed(`${h}:${m}:${sec}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);
  return <span className="font-mono text-3xl font-bold text-primary tabular-nums">{elapsed}</span>;
}

function VarianceBadge({ variance }: { variance: number }) {
  const abs = Math.abs(variance);
  const label = `${variance >= 0 ? '+' : ''}KES ${variance.toLocaleString()}`;
  if (abs === 0) return <span className="text-xs text-green-600 font-semibold">{label}</span>;
  if (abs <= 200) return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-semibold">
      <AlertTriangle className="h-3 w-3" />{label}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-600 font-semibold">
      <AlertTriangle className="h-3 w-3" />{label}
    </span>
  );
}

// ── History table ─────────────────────────────────────────────────────────────

function HistoryTable({ rows }: { rows: ShiftHistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <History className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No shift history yet</p>
        <p className="text-xs text-muted-foreground mt-1">Closed shifts will appear here</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">
                    {new Date(row.opened_at).toLocaleDateString('en-KE', {
                      weekday: 'short', day: 'numeric', month: 'short',
                    })}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {new Date(row.opened_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                    {row.closed_at && ` → ${new Date(row.closed_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    · {formatDuration(row.opened_at, row.closed_at ?? undefined)}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{row.order_count}</span> orders
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Revenue:{' '}
                    <span className="font-semibold text-foreground">
                      KES {row.total_revenue.toLocaleString()}
                    </span>
                  </span>
                  {row.closing_float !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      Cash in:{' '}
                      <span className="font-semibold text-foreground">
                        KES {row.closing_float.toLocaleString()}
                      </span>
                    </span>
                  )}
                  {row.variance !== undefined && <VarianceBadge variance={row.variance} />}
                </div>
                {row.notes && (
                  <p className="text-xs text-muted-foreground mt-1.5 italic">"{row.notes}"</p>
                )}
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                row.status === 'open'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {row.status === 'open' ? 'Open' : 'Closed'}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function ShiftsPage() {
  const [tab, setTab] = useState<Tab>('current');
  const [openingFloat, setOpeningFloat] = useState('');
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  const { can } = usePermissions();
  const handlesCash = can(P.PAYMENTS_VIEW);
  const canManageShifts = can(P.SESSIONS_MANAGE);

  const { data: session, isLoading } = useCurrentShift();
  const openShift = useOpenShift();
  const closeShift = useCloseShift();
  const isOpen = session?.session_status === 'open';
  const { data: summary, refetch: refetchSummary } = useSessionSummary(isOpen);
  const { data: historyData, isLoading: historyLoading } = useShiftHistory();

  const busy = openShift.isPending || closeShift.isPending;
  const historyRows = useMemo(() => historyData?.data ?? [], [historyData]);

  async function handleOpen() {
    try {
      const floatAmt = handlesCash ? (parseFloat(openingFloat) || 0) : 0;
      await openShift.mutateAsync(floatAmt);
      toast.success('Shift opened');
      setOpeningFloat('');
    } catch {
      toast.error('Failed to open shift');
    }
  }

  async function handleClose(payload: { closing_float: number; notes?: string }) {
    try {
      await closeShift.mutateAsync(payload);
      toast.success('Shift closed successfully');
      setCloseDialogOpen(false);
    } catch {
      toast.error('Failed to close shift');
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'current', label: 'My Shift', icon: Clock },
    { id: 'history', label: 'History', icon: History },
    ...(canManageShifts
      ? [{ id: 'planner' as Tab, label: 'Planner', icon: CalendarDays }]
      : []),
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {tab === 'planner' ? 'Shift Planner' : tab === 'history' ? 'Shift History' : 'My Shift'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tab === 'planner'
              ? 'Manage team weekly schedules'
              : isOpen
              ? 'Your shift is currently active'
              : 'No active shift'}
          </p>
        </div>
        {tab === 'current' && isOpen && (
          <button
            onClick={() => refetchSummary()}
            className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 w-full sm:w-fit">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 py-2 px-3 sm:px-4 rounded-lg text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Current Shift Tab ─────────────────────────────────────────────── */}
      {tab === 'current' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left column — status + action */}
          <div className="lg:col-span-2 space-y-4">
            {/* Status card */}
            <Card>
              <CardContent className="p-5">
                {isOpen && session ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                      <span className="text-sm font-semibold text-green-700">Shift Active</span>
                    </div>
                    <ElapsedTimer since={session.opened_at} />
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>
                        Started:{' '}
                        <span className="font-medium text-foreground">
                          {new Date(session.opened_at).toLocaleTimeString('en-KE', {
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </p>
                      {handlesCash && session.float_amount > 0 && (
                        <p>
                          Opening float:{' '}
                          <span className="font-medium text-foreground">
                            KES {session.float_amount.toLocaleString()}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="size-12 rounded-2xl bg-muted flex items-center justify-center shrink-0">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold">No Active Shift</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {handlesCash
                          ? 'Enter your opening float and start your shift'
                          : 'Start your shift to begin tracking orders'}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action card */}
            <Card>
              <CardContent className="p-5 space-y-4">
                {!isOpen && handlesCash && (
                  <label className="block">
                    <span className="text-sm font-medium">Opening Float (KES)</span>
                    <div className="relative mt-1.5">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={openingFloat}
                        onChange={(e) => setOpeningFloat(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Cash placed in the drawer at shift start
                    </p>
                  </label>
                )}

                {isOpen ? (
                  <Button
                    onClick={() =>
                      handlesCash ? setCloseDialogOpen(true) : handleClose({ closing_float: 0 })
                    }
                    disabled={busy}
                    className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 py-6 text-base font-semibold"
                  >
                    {busy
                      ? <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      : <LogOut className="h-5 w-5 mr-2" />
                    }
                    End Shift
                  </Button>
                ) : (
                  <Button
                    onClick={handleOpen}
                    disabled={busy}
                    className="w-full py-6 text-base font-semibold"
                  >
                    {busy
                      ? <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      : <LogIn className="h-5 w-5 mr-2" />
                    }
                    Start Shift
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column — stats (only when shift open) */}
          {isOpen && summary ? (
            <div className="lg:col-span-3 space-y-4">
              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-3">
                {[
                  { label: 'Orders', value: summary.order_count.toString(), icon: ShoppingCart },
                  { label: 'Revenue', value: `KES ${summary.total_revenue.toLocaleString()}`, icon: BarChart3 },
                  { label: 'Expected Cash', value: `KES ${summary.expected_cash.toLocaleString()}`, icon: DollarSign },
                  { label: 'Voids', value: summary.void_count.toString(), icon: TrendingDown },
                ].map(({ label, value, icon: Icon }) => (
                  <Card key={label}>
                    <CardContent className="p-4 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="text-xs">{label}</span>
                      </div>
                      <p className="font-bold text-sm truncate">{value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Tender breakdown */}
              {summary.tender_breakdown && summary.tender_breakdown.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                      Payment Breakdown
                    </p>
                    <div className="space-y-2.5">
                      {summary.tender_breakdown.map((t) => (
                        <div key={t.type} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            {t.type === 'cash'
                              ? <Banknote className="h-4 w-4 text-green-600" />
                              : <CreditCard className="h-4 w-4 text-blue-600" />
                            }
                            <span className="text-foreground capitalize">{t.name || t.type}</span>
                            <span className="text-xs text-muted-foreground">×{t.count}</span>
                          </div>
                          <span className="font-semibold">KES {t.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    {summary.total_refunds > 0 && (
                      <div className="flex items-center justify-between text-sm border-t mt-3 pt-3 text-muted-foreground">
                        <span>Refunds ({summary.refund_count})</span>
                        <span className="text-red-500 font-semibold">
                          − KES {summary.total_refunds.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            /* No shift open — placeholder on right */
            <div className="lg:col-span-3 hidden lg:flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Start your shift to see live stats</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── History Tab ───────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div>
          {historyLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <HistoryTable rows={historyRows} />
          )}
        </div>
      )}

      {/* ── Planner Tab (manager+) ─────────────────────────────────────── */}
      {tab === 'planner' && <ShiftPlannerPanel />}

      {/* Close shift dialog (cashier only) */}
      <ShiftCloseDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        expectedCash={summary?.expected_cash ?? 0}
        onConfirm={handleClose}
        isLoading={closeShift.isPending}
      />
    </div>
  );
}

export default function ShiftsPageGated() {
  return (
    <ModuleGate moduleKey="shifts" fallback={<ModuleUnavailablePage moduleKey="shifts" />}>
      <ShiftsPage />
    </ModuleGate>
  );
}
