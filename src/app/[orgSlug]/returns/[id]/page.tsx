'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Info, Loader2, PackageCheck, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { usePermissions, P } from '@/hooks/usePermissions';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { allowedRefundChannels, defaultRefundChannel, refundChannelAdvisory, REFUND_CHANNELS } from '@/lib/returns-policy';
import { ExchangeLinesPicker, exchangeTotal, type ExchangeLine } from '@/components/pos/returns/exchange-lines-picker';
import { SplitPaymentModal } from '@/components/pos/split-payment-modal';
import { CustomerDetailsModal } from '@/components/pos/customers/customer-details-modal';

interface ReturnLine {
  id: string;
  sku?: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  reason?: string;
}

interface ReturnDetail {
  id: string;
  return_number: string;
  order_id: string;
  // order_number is the original sale's human-readable receipt/invoice number, resolved by pos-api
  // so the UI never renders the raw order UUID.
  order_number?: string;
  // Original buyer, resolved by pos-api from the order — shown + deep-linked to the client profile.
  customer_name?: string;
  customer_phone?: string;
  return_type: 'refund' | 'exchange' | 'store_credit';
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  reason?: string;
  reason_code?: string;
  refund_amount: number;
  refund_channel?: string;
  requested_by: string;
  approved_by?: string;
  treasury_refund_ref?: string;
  exchange_order_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  edges?: { lines?: ReturnLine[] };
}

// Refund channels + the reason/on-account policy live in the shared lib (mirrors pos-api).

const STATUS_CONFIG: Record<ReturnDetail['status'], { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'bg-amber-500/10 text-amber-700 border-amber-200' },
  approved:  { label: 'Approved',  className: 'bg-blue-500/10 text-blue-700 border-blue-200' },
  completed: { label: 'Completed', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-200' },
  rejected:  { label: 'Rejected',  className: 'bg-red-500/10 text-red-600 border-red-200' },
};

const REASON_CODE_LABELS: Record<string, string> = {
  changed_mind: 'Changed mind',
  defective:    'Defective item',
  damaged:      'Damaged item',
  wrong_item:   'Wrong item',
  expired:      'Expired product',
  other:        'Other',
};

function useReturnDetail(returnId: string) {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  return useQuery({
    queryKey: ['return', tenantID, returnId],
    queryFn: () => apiClient.get<ReturnDetail>(`/api/v1/${tenantID}/pos/returns/${returnId}`),
    enabled: !!tenantID && !!returnId,
    staleTime: 30_000,
  });
}

function useApproveReturn(returnId: string) {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { action: 'approve' | 'reject'; notes?: string; refund_channel?: string }) =>
      apiClient.patch(`/api/v1/${tenantID}/pos/returns/${returnId}/approve`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['return', tenantID, returnId] });
      qc.invalidateQueries({ queryKey: ['returns', tenantID] });
    },
  });
}

// useCompleteReturn fulfils an APPROVED return — settles the refund + restocks the goods and moves
// the return into the Completed tab. This is the till/cashier step that follows a manager approval.
interface CompleteReturnResponse {
  id: string;
  exchange?: {
    order_id: string;
    order_number: string;
    replacement_total: number;
    exchange_credit: number;
    amount_payable: number;
    leftover_refund: number;
  };
}

function useCompleteReturn(returnId: string) {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { notes?: string; refund_channel?: string; exchange_lines?: any[] }) =>
      apiClient.post<CompleteReturnResponse>(`/api/v1/${tenantID}/pos/returns/${returnId}/complete`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['return', tenantID, returnId] });
      qc.invalidateQueries({ queryKey: ['returns', tenantID] });
      // Money actually moves at COMPLETE (refund/offset-invoice settles here — see
      // pos-returns-three-stage-lifecycle) — any already-cached customer balance (the POS
      // customer modal, the terminal's CustomerSearch chip) must be refetched, or it keeps
      // showing the pre-return "balance due" for its staleTime window. Both the account-id and
      // identifier-based credit hooks share the 'pos-client-credit' key prefix, so one prefix
      // invalidation covers every consumer.
      qc.invalidateQueries({ queryKey: ['pos-client-credit', tenantID] });
      qc.invalidateQueries({ queryKey: ['customer-modal-orders', tenantID] });
      // A completed return also changes the ORIGINAL sale's own amount_due (completed returns net
      // out of it — see orders.ComputeSettlement) — invalidate the list + single-order queries too,
      // or the All-Sales row and a still-open Sell Details modal keep showing the pre-return due.
      qc.invalidateQueries({ queryKey: ['pos-orders', tenantID] });
      qc.invalidateQueries({ queryKey: ['pos-order', tenantID] });
    },
  });
}

export default function ReturnDetailPage() {
  const params = useParams<{ orgSlug: string; id: string }>();
  const router = useRouter();
  const orgSlug = params?.orgSlug ?? '';
  const returnId = params?.id ?? '';

  const { data: ret, isLoading } = useReturnDetail(returnId);
  const approve = useApproveReturn(returnId);
  const complete = useCompleteReturn(returnId);
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const { canManageOrders, canAny } = usePermissions();
  const [notes, setNotes] = useState('');
  // Approval-time refund channel override; seeded from the return once loaded (default cash).
  const [refundChannel, setRefundChannel] = useState('');
  // Completion-time notes + optional refund-channel confirm (till step).
  const [completeNotes, setCompleteNotes] = useState('');
  const [completeChannel, setCompleteChannel] = useState('');
  const [customerOpen, setCustomerOpen] = useState(false);
  // Exchange completion: replacement items + the top-up payment flow for a dearer swap.
  const [exchangeLines, setExchangeLines] = useState<ExchangeLine[]>([]);
  const [topUpOrder, setTopUpOrder] = useState<{ id: string; number: string; total: number } | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading return details…</span>
      </div>
    );
  }

  if (!ret) {
    return (
      <div className="p-6 text-center text-muted-foreground">Return not found.</div>
    );
  }

  const lines = ret.edges?.lines ?? [];
  const cfg = STATUS_CONFIG[ret.status] ?? { label: ret.status, className: 'bg-muted text-muted-foreground border-border' };
  const isPending = ret.status === 'pending';
  const isApproved = ret.status === 'approved';
  const showChannelPicker = ret.return_type !== 'exchange';
  const isExchange = ret.return_type === 'exchange';
  // Reason/on-account policy (mirrors pos-api returns_policy.go; the server enforces it).
  const onAccount = !!ret.metadata?.on_account_sale;
  const restrictOnAccount = posSettings?.restrict_credit_sale_refund_to_offset ?? true;
  const channelOptions = allowedRefundChannels(ret.reason_code, onAccount, restrictOnAccount);
  const channelAdvisory = refundChannelAdvisory(ret.reason_code, onAccount, restrictOnAccount);
  const policyDefault = defaultRefundChannel(ret.return_type, onAccount);
  const validChannel = (v: string) => (channelOptions.some((c) => c.value === v) ? v : policyDefault);
  // Effective channel: local override → existing channel on the return → policy default —
  // always snapped back into the allowed set.
  const effectiveChannel = validChannel(refundChannel || ret.refund_channel || policyDefault);
  const effectiveCompleteChannel = validChannel(completeChannel || ret.refund_channel || policyDefault);
  const channelLabel = (v: string) => REFUND_CHANNELS.find((c) => c.value === v)?.label ?? v.replace('_', ' ');
  // Stage RBAC: managers approve/reject; a cashier/manager at the till completes an approved return.
  const canApprove = canManageOrders;
  const canComplete = canAny([P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE]);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Back + header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push(`/${orgSlug}/returns`)}
          className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <RotateCcw className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{ret.return_number}</h1>
              <p className="text-xs text-muted-foreground">{new Date(ret.created_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
        <span className={cn('text-xs font-bold px-3 py-1 rounded-full border', cfg.className)}>
          {cfg.label}
        </span>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl border border-border bg-card p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Return Type</p>
          <p className="text-sm font-semibold capitalize mt-0.5">{ret.return_type.replace('_', ' ')}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Refund Amount</p>
          <p className="text-sm font-bold text-success mt-0.5">{formatCurrency(ret.refund_amount, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Reason Code</p>
          <p className="text-sm font-semibold mt-0.5">
            {ret.reason_code ? REASON_CODE_LABELS[ret.reason_code] ?? ret.reason_code : '—'}
          </p>
        </div>
        {ret.return_type !== 'exchange' && (
          <div>
            <p className="text-xs text-muted-foreground">Refund Method</p>
            <p className="text-sm font-semibold capitalize mt-0.5">
              {ret.refund_channel ? ret.refund_channel.replace('_', ' ') : '—'}
            </p>
          </div>
        )}
        {ret.reason && (
          <div className="col-span-2 md:col-span-3">
            <p className="text-xs text-muted-foreground">Reason</p>
            <p className="text-sm mt-0.5">{ret.reason}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground">Original Order</p>
          {ret.order_number ? (
            <a href={`/${orgSlug}/sell/all-sales?invoice=${encodeURIComponent(ret.order_number)}`}
              className="text-sm font-semibold font-mono mt-0.5 truncate text-primary hover:underline block"
              title="Find this sale in All Sales">
              {ret.order_number}
            </a>
          ) : <p className="text-sm font-semibold font-mono mt-0.5">—</p>}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Customer</p>
          {ret.customer_phone ? (
            <button type="button" onClick={() => setCustomerOpen(true)}
              className="text-sm font-semibold mt-0.5 text-primary hover:underline block truncate text-left"
              title="Open customer profile">
              {ret.customer_name || ret.customer_phone}
            </button>
          ) : <p className="text-sm font-semibold mt-0.5">{ret.customer_name || '—'}</p>}
        </div>
        {ret.treasury_refund_ref && (
          <div>
            <p className="text-xs text-muted-foreground">Refund Reference</p>
            {/* The return number is the reference treasury stamps on the customer statement —
                show that, not the internal refund UUID (kept in the tooltip for support). */}
            <p className="text-xs font-mono text-success mt-0.5" title={`Treasury ref: ${ret.treasury_refund_ref}`}>
              {ret.return_number}
            </p>
          </div>
        )}
      </div>

      {/* ── Action panel — sits right under the summary; returned items render below it ── */}

      {/* Stage 1: Pending → manager approves or rejects */}
      {isPending && canApprove && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <p className="text-sm font-bold">Manager Approval</p>
          </div>
          {showChannelPicker && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Refund Method</label>
              <select
                value={effectiveChannel}
                onChange={(e) => setRefundChannel(e.target.value)}
                className="mt-1 w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {channelOptions.map((ch) => <option key={ch.value} value={ch.value} title={ch.hint}>{ch.label}</option>)}
              </select>
              {/* Plain-language explanation of whichever method is selected -- always visible
                  (not hover-only) since till devices are usually touchscreens. */}
              {channelOptions.find((c) => c.value === effectiveChannel)?.hint && (
                <p className="text-[11px] text-muted-foreground mt-1.5 flex items-start gap-1">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{channelOptions.find((c) => c.value === effectiveChannel)?.hint}</span>
                </p>
              )}
              {channelAdvisory && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">{channelAdvisory}</p>
              )}
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Add notes for the decision…"
              className="mt-1 w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => approve.mutate({ action: 'reject', notes }, {
                onSuccess: () => toast.success('Return rejected'),
                onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to reject return')),
              })}
              disabled={approve.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 bg-red-50 text-sm font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </button>
            <button
              onClick={() => approve.mutate({ action: 'approve', notes, ...(showChannelPicker ? { refund_channel: effectiveChannel } : {}) }, {
                onSuccess: () => toast.success('Return approved — ready to complete'),
                onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to approve return')),
              })}
              disabled={approve.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Approve Return
            </button>
          </div>
        </div>
      )}

      {/* Pending but the viewer can't approve → awaiting a manager */}
      {isPending && !canApprove && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">Awaiting manager approval before this return can be completed.</p>
        </div>
      )}

      {/* Stage 2: Approved → cashier/manager completes (settles refund + restocks) */}
      {isApproved && canComplete && (
        <div className="rounded-2xl border border-emerald-200 bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-bold">Complete Return</p>
          </div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-xs text-emerald-800">
            {isExchange ? (
              <>Completing will restock the returned items and raise the replacement sale — a dearer replacement collects the difference at the till; a cheaper one refunds the leftover.</>
            ) : (
              <>Completing will restock the returned items
                {ret.refund_amount > 0 && (
                  <> and settle a <span className="font-semibold">{formatCurrency(ret.refund_amount, currency)}</span> {ret.return_type === 'store_credit' ? 'store credit' : 'refund'} via <span className="font-semibold">{channelLabel(effectiveCompleteChannel)}</span></>
                )}.
              </>
            )}
          </div>
          {isExchange && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Replacement Items</label>
              <div className="mt-1">
                <ExchangeLinesPicker lines={exchangeLines} onChange={setExchangeLines} returnedValue={ret.refund_amount} currency={currency} />
              </div>
            </div>
          )}
          {showChannelPicker && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Confirm Refund Method</label>
              <select
                value={effectiveCompleteChannel}
                onChange={(e) => setCompleteChannel(e.target.value)}
                className="mt-1 w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {channelOptions.map((ch) => <option key={ch.value} value={ch.value} title={ch.hint}>{ch.label}</option>)}
              </select>
              {channelOptions.find((c) => c.value === effectiveCompleteChannel)?.hint && (
                <p className="text-[11px] text-muted-foreground mt-1.5 flex items-start gap-1">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{channelOptions.find((c) => c.value === effectiveCompleteChannel)?.hint}</span>
                </p>
              )}
              {channelAdvisory && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">{channelAdvisory}</p>
              )}
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Notes (optional)</label>
            <textarea
              value={completeNotes}
              onChange={(e) => setCompleteNotes(e.target.value)}
              rows={2}
              placeholder="e.g. cash handed to customer, goods restocked…"
              className="mt-1 w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>
          <button
            onClick={() => complete.mutate(
              {
                notes: completeNotes,
                ...(showChannelPicker ? { refund_channel: effectiveCompleteChannel } : {}),
                ...(isExchange
                  ? {
                      exchange_lines: exchangeLines.map((l) => ({
                        catalog_item_id: l.item.id,
                        sku: l.item.sku,
                        name: l.item.name,
                        quantity: l.quantity,
                        unit_price: l.unitPrice,
                        total_price: l.unitPrice * l.quantity,
                        // Tax as priced in the catalog — the exchange delta the cashier saw
                        // must equal the replacement order's payable.
                        ...(l.item.tax_code_id ? { tax_code_id: l.item.tax_code_id } : {}),
                        ...(l.item.tax_inclusive != null ? { price_includes_tax: l.item.tax_inclusive } : {}),
                        ...(typeof l.item.tax_rate === 'number' ? { tax_rate: l.item.tax_rate } : {}),
                      })),
                    }
                  : {}),
              },
              {
                onSuccess: (resp) => {
                  const ex = resp?.exchange;
                  if (ex && ex.amount_payable > 0.009) {
                    toast.success(`Exchange raised ${ex.order_number} — collect the ${formatCurrency(ex.amount_payable, currency)} top-up`);
                    setTopUpOrder({ id: ex.order_id, number: ex.order_number, total: ex.amount_payable });
                  } else if (ex && ex.leftover_refund > 0.009) {
                    toast.success(`Exchange completed — refund ${formatCurrency(ex.leftover_refund, currency)} to the customer (${channelLabel(effectiveCompleteChannel)})`);
                  } else {
                    toast.success(isExchange ? 'Exchange completed' : 'Return completed');
                  }
                },
                onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to complete return')),
              },
            )}
            disabled={complete.isPending || (isExchange && exchangeLines.length === 0)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {complete.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            {isExchange
              ? exchangeTotal(exchangeLines) - ret.refund_amount > 0.009
                ? 'Complete Exchange & Collect Top-up'
                : 'Complete Exchange'
              : 'Complete Return'}
          </button>
        </div>
      )}

      {/* Exchange top-up payment — the replacement order's payable balance, collected
          through the ordinary payment flow. */}
      {topUpOrder && (
        <SplitPaymentModal
          open
          onClose={() => setTopUpOrder(null)}
          onPaymentConfirmed={() => { setTopUpOrder(null); toast.success('Top-up collected — exchange settled'); }}
          orderId={topUpOrder.id}
          orderNumber={topUpOrder.number}
          total={topUpOrder.total}
          tenantSlug={orgSlug}
        />
      )}

      {/* Approved but the viewer can't complete */}
      {isApproved && !canComplete && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
          <PackageCheck className="h-5 w-5 text-blue-600 shrink-0" />
          <p className="text-sm text-blue-800">Approved — awaiting completion at the till.</p>
        </div>
      )}

      {/* Terminal states */}
      {ret.status === 'completed' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-800">This return has been completed. The refund was settled and the items restocked.</p>
        </div>
      )}
      {ret.status === 'rejected' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <XCircle className="h-5 w-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">This return was rejected.</p>
        </div>
      )}

      {/* Return lines — below the action panel per the QA layout note */}
      {lines.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <div className="px-4 py-3 border-b border-border bg-accent/20">
            <p className="text-sm font-bold">Returned Items</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs">Item</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs">SKU</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs">Qty</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs">Unit Price</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3">{l.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{l.sku ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{l.quantity}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(l.unit_price, currency)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(l.total_price, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {customerOpen && ret.customer_phone && (
        <CustomerDetailsModal
          customerName={ret.customer_name}
          customerPhone={ret.customer_phone}
          onClose={() => setCustomerOpen(false)}
        />
      )}
    </div>
  );
}
