'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeftRight, CheckCircle2, ChevronDown, ChevronRight, Loader2,
  MinusCircle, RefreshCw, Search, ShieldAlert, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { reversalsApi, type Reversal, type ReversalStep } from '@/lib/api/reversals';
import { usePlatformTenants } from '@/hooks/use-platform-tenants';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const REFUND_CHANNELS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mpesa', label: 'M-PESA' },
  { value: 'bank', label: 'Bank' },
  { value: 'store_credit', label: 'Store credit' },
  { value: 'offset_invoice', label: 'Offset invoice (credit sale)' },
];

const STEP_LABELS: Record<string, string> = {
  pos_totals: 'POS order & totals',
  inventory_consumption: 'Inventory consumption',
  treasury_gl: 'Treasury GL',
  etims_credit_note: 'KRA eTIMS credit note',
  loyalty_commission: 'Loyalty & commission clawback',
};

function StepBadge({ status }: { status: ReversalStep['status'] }) {
  switch (status) {
    case 'completed':
      return <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold"><CheckCircle2 className="h-3.5 w-3.5" /> Completed</span>;
    case 'failed':
      return <span className="inline-flex items-center gap-1 text-destructive text-xs font-semibold"><XCircle className="h-3.5 w-3.5" /> Failed</span>;
    case 'skipped':
      return <span className="inline-flex items-center gap-1 text-muted-foreground text-xs font-semibold"><MinusCircle className="h-3.5 w-3.5" /> Skipped</span>;
    default:
      return <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-semibold"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Pending</span>;
  }
}

function ReversalStatusBadge({ status }: { status: Reversal['status'] }) {
  const map: Record<Reversal['status'], string> = {
    completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    partial_failure: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    pending: 'bg-muted text-muted-foreground',
  };
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold capitalize', map[status])}>
      {status.replace('_', ' ')}
    </span>
  );
}

/** Per-step timeline for one reversal (also reused by the history rows). */
function StepsTimeline({ steps }: { steps: ReversalStep[] }) {
  return (
    <div className="space-y-1.5">
      {steps.map((s) => (
        <div key={s.step} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{STEP_LABELS[s.step] ?? s.step} <span className="text-xs text-muted-foreground font-normal">({s.service})</span></p>
            {s.detail && <p className="text-xs text-muted-foreground mt-0.5 wrap-break-word">{s.detail}</p>}
            {s.ref && <p className="text-xs text-muted-foreground mt-0.5">Ref: <span className="font-mono">{s.ref}</span></p>}
          </div>
          <StepBadge status={s.status} />
        </div>
      ))}
    </div>
  );
}

/**
 * Txn Reversals — platform-owner data-repair tool. Reverses a FINALIZED sale (whole order
 * or selected items) across pos totals, inventory consumption, treasury GL and the eTIMS
 * credit note, showing the per-service step ledger. Replaces manual SQL repairs.
 *
 * The platform owner picks the TENANT (and optionally outlet) whose sale needs repair —
 * reversals are almost always on a tenant's data, not the owner's own org. The chosen
 * tenant drives every /api/v1/{tenant}/… call (order search, create, history); the server
 * enforces the platform-owner gate.
 */
export function TxnReversalTab({ tenantID }: { tenantID: string }) {
  const qc = useQueryClient();

  // ── Tenant / outlet scope ──
  const { data: tenants = [] } = usePlatformTenants();
  const [scopeTenantID, setScopeTenantID] = useState(tenantID);
  const [outletID, setOutletID] = useState('');
  const activeTenantID = scopeTenantID || tenantID;

  const { data: outletsData } = useQuery({
    queryKey: ['reversal-outlets', activeTenantID],
    queryFn: () => apiClient.get<{ data: any[] } | any[]>(`/api/v1/${activeTenantID}/pos/outlets`),
    enabled: !!activeTenantID,
    staleTime: 5 * 60_000,
  });
  const outlets: any[] = Array.isArray(outletsData) ? outletsData : ((outletsData as any)?.data ?? []);

  // ── Order picker ──
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('completed');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [selectedLines, setSelectedLines] = useState<Record<string, { checked: boolean; qty: number }>>({});
  const [scope, setScope] = useState<'full' | 'partial'>('partial');
  const [reason, setReason] = useState('');
  const [refundChannel, setRefundChannel] = useState('cash');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<Reversal | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Switching tenant/outlet invalidates any in-progress selection.
  function changeScope(nextTenant: string, nextOutlet: string) {
    setScopeTenantID(nextTenant);
    setOutletID(nextOutlet);
    setSelectedOrder(null);
    setSelectedLines({});
    setSearchQuery('');
    setDebouncedQuery('');
    setResult(null);
  }

  const { data: searchData, isFetching: searching } = useQuery({
    queryKey: ['reversal-order-search', activeTenantID, outletID, debouncedQuery, statusFilter],
    queryFn: () =>
      apiClient.get<{ data: any[] }>(`/api/v1/${activeTenantID}/pos/orders`, {
        order_number: debouncedQuery,
        status: statusFilter || undefined,
        outlet_id: outletID || undefined,
        limit: 8,
      }),
    enabled: !!activeTenantID && debouncedQuery.length >= 2 && !selectedOrder,
    staleTime: 30_000,
  });
  const searchResults: any[] = (searchData as any)?.data ?? [];

  const activeLines: any[] = useMemo(
    () => (selectedOrder?.edges?.lines ?? []).filter((l: any) => l.voided_qty == null),
    [selectedOrder],
  );

  function handleSelectOrder(order: any) {
    setSelectedOrder(order);
    setSearchQuery(order.order_number ?? order.id);
    setResult(null);
    const init: Record<string, { checked: boolean; qty: number }> = {};
    (order.edges?.lines ?? [])
      .filter((l: any) => l.voided_qty == null)
      .forEach((l: any) => { init[l.id] = { checked: false, qty: l.quantity ?? 1 }; });
    setSelectedLines(init);
  }

  function clearOrder() {
    setSelectedOrder(null);
    setSearchQuery('');
    setDebouncedQuery('');
    setSelectedLines({});
    setResult(null);
  }

  const chosenLines = activeLines.filter((l) => selectedLines[l.id]?.checked);
  const reversedValue = scope === 'full'
    ? activeLines.reduce((s, l) => s + (l.total_price ?? 0), 0)
    : chosenLines.reduce((s, l) => {
        const sel = selectedLines[l.id];
        const ratio = (sel?.qty ?? l.quantity) / (l.quantity || 1);
        return s + (l.total_price ?? 0) * ratio;
      }, 0);

  const canSubmit = !!selectedOrder && reason.trim().length >= 5 && (scope === 'full' || chosenLines.length > 0);

  const createMutation = useMutation({
    mutationFn: () =>
      reversalsApi.create(activeTenantID, {
        order_id: selectedOrder.id,
        scope,
        lines: scope === 'partial'
          ? chosenLines.map((l) => ({ line_id: l.id, quantity: selectedLines[l.id]?.qty ?? l.quantity }))
          : undefined,
        reason: reason.trim(),
        refund_channel: refundChannel,
        idempotency_key: `ui-${selectedOrder.id}-${scope}-${Date.now()}`,
      }),
    onSuccess: (rev) => {
      setResult(rev);
      toast[rev.status === 'completed' ? 'success' : 'warning'](
        rev.status === 'completed'
          ? `Reversal ${rev.reversal_number} completed across all services`
          : `Reversal ${rev.reversal_number} finished with issues — check the step ledger`,
      );
      void qc.invalidateQueries({ queryKey: ['reversals', activeTenantID] });
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Reversal failed')),
  });

  // ── History ──
  const [historyStatus, setHistoryStatus] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: historyData, isFetching: loadingHistory, refetch: refetchHistory } = useQuery({
    queryKey: ['reversals', activeTenantID, historyStatus],
    queryFn: () => reversalsApi.list(activeTenantID, { status: historyStatus || undefined, limit: 25 }),
    enabled: !!activeTenantID,
    refetchInterval: 15_000,
  });
  const history: Reversal[] = (historyData as any)?.data ?? [];

  const retryMutation = useMutation({
    mutationFn: (reversalId: string) => reversalsApi.retry(activeTenantID, reversalId),
    onSuccess: (rev) => {
      toast[rev.status === 'completed' ? 'success' : 'warning'](`Retry finished: ${rev.status.replace('_', ' ')}`);
      void qc.invalidateQueries({ queryKey: ['reversals', activeTenantID] });
      if (result?.id === rev.id) setResult(rev);
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Retry failed')),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Platform-owner data-repair tool for <strong>finalized</strong> sales. It reverses the order across
          POS totals, inventory consumption, treasury GL and (when fiscalised) the KRA eTIMS credit note —
          with every step tracked below. Customer-initiated returns should use the normal Returns flow instead.
        </p>
      </div>

      {/* Tenant + outlet scope — the reversal operates on the SELECTED tenant's data. */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-muted-foreground">Tenant</label>
        <select
          value={activeTenantID}
          onChange={(e) => changeScope(e.target.value, '')}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm min-w-56"
        >
          <option value={tenantID}>My org (default)</option>
          {tenants
            .filter((t) => t.id !== tenantID)
            .map((t) => <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>)}
        </select>
        <label className="text-sm font-semibold text-muted-foreground">Outlet</label>
        <select
          value={outletID}
          onChange={(e) => changeScope(activeTenantID, e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm min-w-44"
        >
          <option value="">All outlets</option>
          {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* ── New reversal ── */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <h2 className="px-4 py-3 border-b border-border text-sm font-bold flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" /> New reversal
          </h2>
          <div className="p-4 space-y-4">
            {/* Order search */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); if (selectedOrder) clearOrder(); }}
                  placeholder="Search order number (e.g. POS-8DC685D5A983)…"
                  className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-sm"
                />
                {searching && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                {!selectedOrder && searchResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-card shadow-lg max-h-64 overflow-y-auto">
                    {searchResults.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => handleSelectOrder(o)}
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center justify-between"
                      >
                        <span className="font-medium">{o.order_number}</span>
                        <span className="text-xs text-muted-foreground capitalize">{o.status} · {(o.total_amount ?? 0).toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="completed">Completed</option>
                <option value="paid">Paid</option>
                <option value="closed">Closed</option>
                <option value="">Any status</option>
              </select>
            </div>

            {selectedOrder && (
              <>
                <div className="rounded-xl border border-border px-3 py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-bold">{selectedOrder.order_number}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {selectedOrder.status} · total {(selectedOrder.total_amount ?? 0).toLocaleString()} · paid {(selectedOrder.paid_total ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <button onClick={clearOrder} className="text-xs font-semibold text-primary hover:underline">Change</button>
                </div>

                {/* Scope */}
                <div className="flex gap-2">
                  {(['partial', 'full'] as const).map((sc) => (
                    <button
                      key={sc}
                      onClick={() => setScope(sc)}
                      className={cn(
                        'flex-1 rounded-xl border px-3 py-2 text-sm font-semibold',
                        scope === sc ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {sc === 'partial' ? 'Reverse item(s)' : 'Reverse whole order'}
                    </button>
                  ))}
                </div>

                {/* Line picker */}
                {scope === 'partial' && (
                  <div className="rounded-xl border border-border divide-y divide-border/60 max-h-56 overflow-y-auto">
                    {activeLines.length === 0 && (
                      <p className="px-3 py-3 text-sm text-muted-foreground">No active (un-voided) lines left on this order.</p>
                    )}
                    {activeLines.map((l) => {
                      const sel = selectedLines[l.id] ?? { checked: false, qty: l.quantity ?? 1 };
                      return (
                        <label key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-accent/50">
                          <input
                            type="checkbox"
                            checked={sel.checked}
                            onChange={(e) => setSelectedLines((m) => ({ ...m, [l.id]: { ...sel, checked: e.target.checked } }))}
                          />
                          <span className="flex-1 min-w-0 truncate">{l.name} <span className="text-xs text-muted-foreground">({l.sku})</span></span>
                          <input
                            type="number"
                            min={0.01}
                            max={l.quantity}
                            step="any"
                            value={sel.qty}
                            disabled={!sel.checked}
                            onChange={(e) => {
                              const q = Math.min(parseFloat(e.target.value) || 0, l.quantity);
                              setSelectedLines((m) => ({ ...m, [l.id]: { ...sel, qty: q } }));
                            }}
                            className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-sm text-right disabled:opacity-40"
                          />
                          <span className="text-xs text-muted-foreground w-8">/ {l.quantity}</span>
                          <span className="tabular-nums w-20 text-right">{(l.total_price ?? 0).toLocaleString()}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Reason + channel */}
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for the reversal (required, min 5 characters) — e.g. item recorded but never served"
                  rows={2}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                <div className="flex items-center gap-3">
                  <label className="text-sm text-muted-foreground shrink-0">Refund channel</label>
                  <select
                    value={refundChannel}
                    onChange={(e) => setRefundChannel(e.target.value)}
                    className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  >
                    {REFUND_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                  <span className="text-sm font-semibold">Value to reverse</span>
                  <span className="text-lg font-bold tabular-nums">{reversedValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>

                <button
                  disabled={!canSubmit || createMutation.isPending}
                  onClick={() => setConfirmOpen(true)}
                  className="w-full rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {scope === 'full' ? 'Reverse whole order' : `Reverse ${chosenLines.length} item(s)`}
                </button>
              </>
            )}

            {/* Result steps */}
            {result && (
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">{result.reversal_number}</p>
                  <ReversalStatusBadge status={result.status} />
                </div>
                <StepsTimeline steps={result.steps} />
                {(result.status === 'partial_failure' || result.status === 'failed') && (
                  <button
                    onClick={() => retryMutation.mutate(result.id)}
                    disabled={retryMutation.isPending}
                    className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', retryMutation.isPending && 'animate-spin')} /> Retry failed steps
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── History ── */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Reversal history
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={historyStatus}
                onChange={(e) => setHistoryStatus(e.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="">All statuses</option>
                <option value="completed">Completed</option>
                <option value="partial_failure">Partial failure</option>
                <option value="failed">Failed</option>
              </select>
              <button onClick={() => void refetchHistory()} className="text-muted-foreground hover:text-foreground">
                <RefreshCw className={cn('h-4 w-4', loadingHistory && 'animate-spin')} />
              </button>
            </div>
          </div>
          {history.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No reversals yet.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {history.map((rv) => (
                <div key={rv.id}>
                  <button
                    onClick={() => setExpanded(expanded === rv.id ? null : rv.id)}
                    className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-accent/50"
                  >
                    {expanded === rv.id ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {rv.reversal_number} · {rv.order_number}
                        <span className="ml-2 text-xs text-muted-foreground capitalize">({rv.scope})</span>
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{rv.reason}</p>
                    </div>
                    <span className="tabular-nums text-sm font-semibold shrink-0">{rv.amount.toLocaleString()}</span>
                    <ReversalStatusBadge status={rv.status} />
                  </button>
                  {expanded === rv.id && (
                    <div className="px-4 pb-3 space-y-2">
                      <StepsTimeline steps={rv.steps} />
                      {(rv.status === 'partial_failure' || rv.status === 'failed') && (
                        <button
                          onClick={() => retryMutation.mutate(rv.id)}
                          disabled={retryMutation.isPending}
                          className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                        >
                          <RefreshCw className={cn('h-3.5 w-3.5', retryMutation.isPending && 'animate-spin')} /> Retry failed steps
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={scope === 'full' ? 'Reverse the whole order?' : 'Reverse selected item(s)?'}
        description={`This reverses ${reversedValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} on ${selectedOrder?.order_number ?? ''} across POS, inventory, treasury GL and eTIMS (when fiscalised). The action is recorded in the audit trail and cannot be un-done from this screen.`}
        confirmLabel="Execute reversal"
        variant="danger"
        loading={createMutation.isPending}
        onConfirm={() => { setConfirmOpen(false); createMutation.mutate(); }}
      />
    </div>
  );
}
