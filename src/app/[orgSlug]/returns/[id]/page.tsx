'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Info, Loader2, PackageCheck, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { usePermissions, P } from '@/hooks/usePermissions';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { allowedRefundChannels, defaultRefundChannel, refundChannelAdvisory, REFUND_CHANNELS, restockByPolicy } from '@/lib/returns-policy';
import { ExchangeLinesPicker, exchangeTotal, type ExchangeLine } from '@/components/pos/returns/exchange-lines-picker';
import { SplitPaymentModal } from '@/components/pos/split-payment-modal';
import { CustomerDetailsModal } from '@/components/pos/customers/customer-details-modal';
import { ReceiptPreview } from '@/components/pos/receipt-preview';
import { useReceiptAfterSale } from '@/hooks/use-receipt-after-sale';
import { autoPrintsCustomerCopy, resolveBillProfile } from '@/lib/pos/printer-stations';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { buildReturnLineColumns, returnLineLocations, type ReturnLine } from './return-lines-columns';
import { RestockStatusCard } from '@/components/pos/returns/restock-status-card';

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
  // Branch the return belongs to (location means outlet), resolved by pos-api.
  outlet_name?: string;
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
    mutationFn: (payload: { notes?: string; refund_channel?: string; exchange_lines?: any[]; restock?: boolean }) =>
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
  // Restock choice at completion; null follows the outlet's restock policy for the reason code.
  const [restockOverride, setRestockOverride] = useState<boolean | null>(null);
  const [completeChannel, setCompleteChannel] = useState('');
  const [customerOpen, setCustomerOpen] = useState(false);
  // Exchange completion: replacement items + the top-up payment flow for a dearer swap.
  const [exchangeLines, setExchangeLines] = useState<ExchangeLine[]>([]);
  const [topUpOrder, setTopUpOrder] = useState<{ id: string; number: string; total: number } | null>(null);
  // "Returned To" shows where inventory put each item back; only meaningful once completed.
  const lineColumns = useMemo(
    () => buildReturnLineColumns(currency, ret?.status === 'completed' ? returnLineLocations(ret.metadata) : undefined),
    [currency, ret?.status, ret?.metadata],
  );
  // Completion receipt. A refund/store-credit return is its own document (pos-api's returns
  // receipt endpoint renders it with the REFUND framing) and is NOT a fiscalised sale, so it
  // uses showReceiptFromEndpoint. An exchange instead raises a normal fully-paid replacement
  // order, which the ordinary order receipt already renders correctly — showReceiptForOrder.
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? '');
  const authUser = useAuthStore((s) => s.user);
  const {
    receiptData, receiptOpen, receiptOrderId,
    showReceiptForOrder, showReceiptFromEndpoint, closeReceipt,
  } = useReceiptAfterSale(tenantId, authUser?.fullName || authUser?.email);

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
  const restock = restockOverride ?? restockByPolicy(ret.reason_code, posSettings?.return_no_restock_reasons);
  const channelLabel = (v: string) => REFUND_CHANNELS.find((c) => c.value === v)?.label ?? v.replace('_', ' ');
  // Stage RBAC: managers approve/reject; a cashier/manager at the till completes an approved return.
  const canApprove = canManageOrders;
  const canComplete = canAny([P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE]);

  return (
    // Full width like the Returns list (the shell adds no padding; pages own p-*). No max-w
    // column: a narrow centred column left large dead margins on desktop.
    <div className="p-4 sm:p-6 space-y-5">
      {/* Back + header */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <button
          onClick={() => router.push(`/${orgSlug}/returns`)}
          aria-label="Back to returns"
          className="h-9 w-9 shrink-0 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
            <RotateCcw className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold truncate">Return {ret.return_number}</h1>
            <p className="text-xs text-muted-foreground">
              {new Date(ret.created_at).toLocaleString()}
              {ret.outlet_name ? ` · ${ret.outlet_name}` : ''}
            </p>
          </div>
        </div>
        <span className={cn('text-xs font-bold px-3 py-1 rounded-full border shrink-0', cfg.className)}>
          {cfg.label}
        </span>
      </div>

      {/* Summary strip: wraps from 2 columns on phones up to 6 on wide screens. */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-4 gap-y-4">
        <div>
          <p className="text-xs text-muted-foreground">Refund Amount</p>
          <p className="text-base font-bold text-success mt-0.5">{formatCurrency(ret.refund_amount, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Return Type</p>
          <p className="text-sm font-semibold capitalize mt-0.5">{ret.return_type.replace('_', ' ')}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Reason</p>
          <p className="text-sm font-semibold mt-0.5">
            {ret.reason_code ? REASON_CODE_LABELS[ret.reason_code] ?? ret.reason_code : ret.reason || '—'}
          </p>
        </div>
        {ret.return_type !== 'exchange' && (
          <div>
            <p className="text-xs text-muted-foreground">Refund Method</p>
            <p className="text-sm font-semibold capitalize mt-0.5">
              {ret.refund_channel ? channelLabel(ret.refund_channel) : '—'}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground">Outlet</p>
          <p className="text-sm font-semibold mt-0.5 truncate">{ret.outlet_name || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Original Order</p>
          {ret.order_number ? (
            <Link href={`/${orgSlug}/sell/all-sales?invoice=${encodeURIComponent(ret.order_number)}`}
              className="text-sm font-semibold font-mono mt-0.5 truncate text-primary hover:underline block"
              title="Find this sale in All Sales">
              {ret.order_number}
            </Link>
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
        {/* Free-text notes only when they add something beyond the reason label. */}
        {ret.reason && (!ret.reason_code || ret.reason !== (REASON_CODE_LABELS[ret.reason_code] ?? '')) && (
          <div className="col-span-2 sm:col-span-3 lg:col-span-4 xl:col-span-6">
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="text-sm mt-0.5 break-words">{ret.reason}</p>
          </div>
        )}
      </div>

      {/* Two columns on wide screens: returned items (main) beside the actions and stock status
          (sticky). Stacks on smaller screens with the actions first, where the user acts. */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] items-start">
      <aside className="space-y-5 xl:order-2 xl:sticky xl:top-4 min-w-0">

      {/* Where the returned goods went back into stock (reported by inventory). */}
      {ret.status === 'completed' && (
        <RestockStatusCard returnId={ret.id} metadata={ret.metadata} canRetry={canManageOrders} />
      )}

      {/* ── Action panel ── */}

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
              <>Completing will {restock ? 'restock' : 'write off'} the returned items and raise the replacement sale. A dearer replacement collects the difference at the till; a cheaper one refunds the leftover.</>
            ) : (
              <>Completing will {restock ? 'restock' : 'write off (not restock)'} the returned items
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
          <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-border px-3 py-2.5">
            <input
              type="checkbox"
              checked={restock}
              onChange={(e) => setRestockOverride(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-xs">
              <span className="font-medium text-foreground">Put items back into stock</span>{' '}
              <span className="text-muted-foreground">
                {restock
                  ? 'They return to the branch they were sold from and can be sold again.'
                  : 'Unticked: the items are written off (damaged, defective or expired goods are not restocked by default).'}
              </span>
            </span>
          </label>
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
                restock,
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
                  // Print the customer's copy. An exchange with a top-up still owing waits for
                  // the top-up payment (the SplitPaymentModal below raises the receipt then), so
                  // the replacement order's receipt is never printed as "paid" before it is.
                  if (isExchange) {
                    if (ex?.order_id && !(ex.amount_payable > 0.009)) void showReceiptForOrder(ex.order_id);
                  } else {
                    void showReceiptFromEndpoint(`/api/v1/${tenantId}/pos/returns/${returnId}/receipt`);
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
          onPaymentConfirmed={() => {
            const settledId = topUpOrder.id;
            setTopUpOrder(null);
            toast.success('Top-up collected — exchange settled');
            // NOW the replacement order is fully paid — print its receipt.
            void showReceiptForOrder(settledId);
          }}
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
          <p className="text-sm text-emerald-800">
            Completed. The refund was settled
            {ret.metadata?.restock_decision === 'write_off' ? ' and the items were written off (not restocked).' : ' and the items were sent back to stock.'}
          </p>
        </div>
      )}
      {ret.status === 'rejected' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-600 shrink-0" />
          <div className="text-sm text-red-700">
            <p>This return was rejected.</p>
            {ret.metadata?.rejection_notes && <p className="mt-1 text-red-600/90">{ret.metadata.rejection_notes}</p>}
          </div>
        </div>
      )}
      </aside>

      {/* Returned items: the main column */}
      <section className="min-w-0 xl:order-1 rounded-2xl border border-border overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border bg-accent/20 flex items-center justify-between gap-2">
          <p className="text-sm font-bold">Returned Items</p>
          <span className="text-xs text-muted-foreground">{lines.length} item{lines.length === 1 ? '' : 's'}</span>
        </div>
        {lines.length > 0 ? (
          <div className="px-2 pb-2">
            <DataTable<ReturnLine>
              columns={lineColumns}
              rows={lines}
              rowKey={(l) => l.id}
              storageKey="return-lines-col-prefs"
            />
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">No items on this return.</p>
        )}
      </section>
      </div>
      {customerOpen && ret.customer_phone && (
        <CustomerDetailsModal
          customerName={ret.customer_name}
          customerPhone={ret.customer_phone}
          onClose={() => setCustomerOpen(false)}
        />
      )}

      {/* Refund / exchange receipt — mounted exactly like the POS terminal's. orderId is only
          set for the exchange's replacement order; a refund document has no order of its own. */}
      <ReceiptPreview
        receipt={receiptData}
        open={receiptOpen}
        onClose={closeReceipt}
        printerProfile={resolveBillProfile((posSettings as any)?.printer_profiles)}
        tenantId={tenantId}
        orderId={receiptOrderId}
        autoPrint={autoPrintsCustomerCopy(posSettings as any) && !(posSettings as any)?.print_agent_online}
      />
    </div>
  );
}
