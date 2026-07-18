'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { CustomerDetailsModal } from '@/components/pos/customers/customer-details-modal';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useEffectiveOnline } from '@/lib/connectivity';
import { v4 as uuidv4 } from 'uuid';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Plus, RotateCcw, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { allowedRefundChannels, defaultRefundChannel, refundChannelAdvisory } from '@/lib/returns-policy';

interface ReturnItem {
  id: string;
  return_number: string;
  original_order_id?: string;
  original_receipt_number?: string;
  customer_name?: string;
  customer_phone?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  refund_amount?: number;
  currency?: string;
  // refund_channel is the backend field (cash|mpesa|bank|cheque|store_credit|offset_invoice);
  // refund_method is kept as a fallback for any legacy serialization.
  refund_channel?: string;
  refund_method?: string;
  created_at: string;
  line_items?: { name: string; qty: number; unit_price: number }[];
}

const STATUS_CONFIG: Record<ReturnItem['status'], { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'bg-warning/10 text-warning' },
  approved:  { label: 'Approved',  className: 'bg-primary/10 text-primary' },
  completed: { label: 'Completed', className: 'bg-success/10 text-success' },
  rejected:  { label: 'Rejected',  className: 'bg-destructive/10 text-destructive' },
};

function useReturns(status: string) {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  return useQuery({
    queryKey: ['returns', tenantID, status],
    queryFn: () =>
      apiClient.get<{ data: ReturnItem[] }>(
        `/api/v1/${tenantID}/pos/returns${status ? `?status=${status}` : ''}`
      ),
    enabled: !!tenantID,
    staleTime: 60_000,
  });
}

interface ReturnLinePayload {
  order_line_id: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface InitiateReturnPayload {
  return_type: string;
  reason: string;
  reason_code?: string;
  refund_channel?: string;
  lines: ReturnLinePayload[];
}

// Refund channels + reason policy live in the shared lib (mirrors pos-api returns_policy.go).

function useInitiateReturn() {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  const tenantSlug = user?.tenant_slug ?? tenantID;
  const outletID = (user as (typeof user & { outlet_id?: string }) | null)?.outlet_id ?? '';
  const isOnline = useEffectiveOnline();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, payload }: { orderId: string; payload: InitiateReturnPayload }) => {
      const localId = uuidv4();
      const queueOffline = async () => {
        // Queue the return; the order shown in the picker came from a server search so its id
        // is a server id. Synced on reconnect (idempotent via the Idempotency-Key = local_id).
        const { saveDraftReturn } = await import('@/lib/db/pos-db');
        const refundAmount = payload.lines.reduce((s, l) => s + (l.total_price ?? 0), 0);
        await saveDraftReturn({
          local_id: localId,
          server_order_id: orderId,
          outlet_id: outletID,
          return_type: payload.return_type,
          reason: payload.reason,
          reason_code: payload.reason_code,
          refund_channel: payload.refund_channel,
          lines: payload.lines.map((l) => ({
            order_line_id: l.order_line_id,
            sku: l.sku,
            name: l.name,
            quantity: l.quantity,
            unit_price: l.unit_price,
            total_price: l.total_price,
          })),
          refund_amount: refundAmount,
          tenant_id: tenantID,
          tenant_slug: tenantSlug,
          created_at: new Date().toISOString(),
          synced: false,
        });
        return { offline: true };
      };
      if (!isOnline) return queueOffline();
      try {
        return await apiClient.post(
          `/api/v1/${tenantID}/pos/orders/${orderId}/returns`,
          payload,
          { headers: { 'Idempotency-Key': localId } },
        );
      } catch (err) {
        // Write-behind on weak wifi: queue instead of erroring; replay dedups via local_id.
        const { isNetworkShapedError } = await import('@/lib/connectivity');
        if (!isNetworkShapedError(err)) throw err;
        toast.info('Network unreachable — return saved offline and will sync automatically.');
        return queueOffline();
      }
    },
    networkMode: 'always',
    onSuccess: () => qc.invalidateQueries({ queryKey: ['returns', tenantID] }),
  });
}

const FILTERS: { key: string; label: string }[] = [
  { key: '',          label: 'All'       },
  { key: 'pending',   label: 'Pending'   },
  { key: 'approved',  label: 'Approved'  },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected',  label: 'Rejected'  },
];

const RETURN_REASONS = [
  'Defective / damaged',
  'Wrong item received',
  'Changed mind',
  'Duplicate purchase',
  'Item not as described',
  'Other',
];
const REASON_CODES: { value: string; label: string }[] = [
  { value: '',             label: '— Select code —'  },
  { value: 'changed_mind', label: 'Changed mind'      },
  { value: 'defective',    label: 'Defective item'    },
  { value: 'damaged',      label: 'Damaged item'      },
  { value: 'wrong_item',   label: 'Wrong item'        },
  { value: 'expired',      label: 'Expired product'   },
  { value: 'other',        label: 'Other'             },
];
const RETURN_TYPES: { value: string; label: string }[] = [
  { value: 'refund',       label: 'Refund'        },
  { value: 'exchange',     label: 'Exchange'      },
  { value: 'store_credit', label: 'Store Credit'  },
];

function InitiateReturnModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedLines, setSelectedLines] = useState<Record<string, { checked: boolean; qty: number }>>({});

  const [returnType, setReturnType] = useState('refund');
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [reasonCode, setReasonCode] = useState('');
  const [refundChannel, setRefundChannel] = useState('cash');
  // Exchange top-up: amount to collect from the customer when the replacement is pricier than the
  // returned goods. Recorded in the return reason so the cashier/accounting has a trail.
  const [topUpAmount, setTopUpAmount] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { mutate, isPending, isError } = useInitiateReturn();

  // Was the original sale settled on account (credit sale)? Detected from its payments'
  // tender types — an unpaid credit sale must be settled by offsetting the customer's
  // balance, never by paying out money (mirrors pos-api returns_policy.go).
  const { data: orderPayments } = useQuery({
    queryKey: ['pos-order-payments', tenantID, selectedOrder?.id],
    queryFn: () => apiClient.get<any>(`/api/v1/${tenantID}/pos/orders/${selectedOrder.id}/payments`),
    enabled: !!tenantID && !!selectedOrder?.id,
    staleTime: 60_000,
  });
  const onAccount = ((orderPayments as any)?.data ?? []).some(
    (p: any) => p.tender_type === 'on_account' && p.status === 'completed',
  );
  const channelOptions = allowedRefundChannels(reasonCode || undefined, onAccount);
  const channelAdvisory = refundChannelAdvisory(reasonCode || undefined, onAccount);
  // Keep the selection valid when the reason/on-account context narrows the options.
  useEffect(() => {
    if (returnType !== 'exchange' && !channelOptions.some((c) => c.value === refundChannel)) {
      setRefundChannel(defaultRefundChannel(returnType, onAccount));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reasonCode, onAccount, returnType]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: searchData, isFetching: searching } = useQuery({
    queryKey: ['order-search', tenantID, debouncedQuery],
    queryFn: () =>
      apiClient.get<{ data: any[] }>(
        `/api/v1/${tenantID}/pos/orders`,
        { order_number: debouncedQuery, limit: 8 } as any,
      ),
    enabled: !!tenantID && debouncedQuery.length >= 2 && !selectedOrder,
    staleTime: 30_000,
  });

  const searchResults: any[] = (searchData as any)?.data ?? [];

  function handleSelectOrder(order: any) {
    setSelectedOrder(order);
    setSearchQuery(order.order_number ?? order.id);
    setShowDropdown(false);
    const lines: any[] = order.edges?.lines ?? [];
    const init: Record<string, { checked: boolean; qty: number }> = {};
    lines.forEach((l: any) => { init[l.id] = { checked: true, qty: l.quantity ?? 1 }; });
    setSelectedLines(init);
  }

  function clearOrder() {
    setSelectedOrder(null);
    setSearchQuery('');
    setDebouncedQuery('');
    setSelectedLines({});
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrder) return;
    const lines: any[] = selectedOrder.edges?.lines ?? [];
    const returnLines: ReturnLinePayload[] = lines
      .filter((l: any) => selectedLines[l.id]?.checked)
      .map((l: any) => {
        const qty = selectedLines[l.id]?.qty ?? l.quantity ?? 1;
        const unitPrice = l.unit_price ?? 0;
        return {
          order_line_id: l.id,
          sku: l.sku ?? '',
          name: l.name ?? l.item_name ?? 'Item',
          quantity: qty,
          unit_price: unitPrice,
          total_price: unitPrice * qty,
        };
      });
    if (returnLines.length === 0) return;
    const topUp = returnType === 'exchange' ? parseFloat(topUpAmount) || 0 : 0;
    const reasonWithTopUp =
      topUp > 0 ? `${reason} · Exchange top-up collected: KES ${topUp.toLocaleString()}` : reason;
    mutate(
      {
        orderId: selectedOrder.id,
        payload: {
          return_type: returnType,
          reason: reasonWithTopUp,
          ...(reasonCode ? { reason_code: reasonCode } : {}),
          // Exchanges settle in-kind (no cash refund channel); refunds/store-credit carry the channel.
          ...(returnType === 'exchange' ? {} : { refund_channel: refundChannel }),
          lines: returnLines,
        },
      },
      { onSuccess: onClose },
    );
  }

  const orderLines: any[] = selectedOrder?.edges?.lines ?? [];
  const selectedCount = Object.values(selectedLines).filter((s) => s.checked).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="text-base font-bold">Initiate Return</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-xl hover:bg-accent flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Order search */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Search Order</label>
            <div className="relative mt-1" ref={dropdownRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (selectedOrder) clearOrder();
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Type order # or receipt number…"
                  className="w-full bg-background border border-border rounded-xl py-2.5 pl-9 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoComplete="off"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {selectedOrder && !searching && (
                  <button
                    type="button"
                    onClick={clearOrder}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Dropdown results */}
              {showDropdown && !selectedOrder && searchResults.length > 0 && (
                <div className="absolute z-20 top-full mt-1 w-full bg-background border border-border rounded-xl shadow-lg overflow-hidden">
                  {searchResults.map((order: any) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => handleSelectOrder(order)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors text-left border-b border-border last:border-0"
                    >
                      <div>
                        <p className="text-sm font-semibold font-mono">{order.order_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString()} · {order.edges?.lines?.length ?? 0} item(s)
                        </p>
                      </div>
                      <span className="text-sm font-bold text-primary shrink-0 ml-4">
                        KES {(order.total_amount ?? 0).toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Selected order + items table */}
          {selectedOrder && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
                <div>
                  <p className="text-sm font-bold font-mono">{selectedOrder.order_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(selectedOrder.created_at).toLocaleDateString()} · KES {(selectedOrder.total_amount ?? 0).toLocaleString()}
                  </p>
                </div>
                <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-1 rounded-lg capitalize">
                  {selectedOrder.status}
                </span>
              </div>

              {orderLines.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    Select Items to Return ({selectedCount} of {orderLines.length} selected)
                  </p>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-accent/30 border-b border-border">
                          <th className="w-8 px-3 py-2 text-left">
                            <input
                              type="checkbox"
                              checked={orderLines.every((l: any) => selectedLines[l.id]?.checked)}
                              onChange={(e) => {
                                const updated: Record<string, { checked: boolean; qty: number }> = {};
                                orderLines.forEach((l: any) => {
                                  updated[l.id] = { checked: e.target.checked, qty: selectedLines[l.id]?.qty ?? l.quantity ?? 1 };
                                });
                                setSelectedLines(updated);
                              }}
                              className="rounded"
                            />
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Item</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">Orig. Qty</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">Return Qty</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Unit Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {orderLines.map((line: any) => {
                          const sel = selectedLines[line.id] ?? { checked: false, qty: line.quantity ?? 1 };
                          return (
                            <tr key={line.id} className={cn('transition-colors', sel.checked ? 'bg-background' : 'opacity-50 bg-muted/20')}>
                              <td className="px-3 py-2.5">
                                <input
                                  type="checkbox"
                                  checked={sel.checked}
                                  onChange={(e) =>
                                    setSelectedLines((prev) => ({
                                      ...prev,
                                      [line.id]: { ...prev[line.id], checked: e.target.checked, qty: prev[line.id]?.qty ?? line.quantity ?? 1 },
                                    }))
                                  }
                                  className="rounded"
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <p className="font-medium truncate max-w-[200px]">{line.name ?? line.item_name ?? 'Item'}</p>
                                {line.sku && <p className="text-xs text-muted-foreground">{line.sku}</p>}
                              </td>
                              <td className="px-3 py-2.5 text-center text-muted-foreground">{line.quantity ?? 1}</td>
                              <td className="px-3 py-2.5 text-center">
                                <input
                                  type="number"
                                  min={1}
                                  max={line.quantity ?? 1}
                                  value={sel.qty}
                                  disabled={!sel.checked}
                                  onChange={(e) => {
                                    const v = Math.min(Math.max(1, parseInt(e.target.value) || 1), line.quantity ?? 1);
                                    setSelectedLines((prev) => ({ ...prev, [line.id]: { ...prev[line.id], qty: v } }));
                                  }}
                                  className="w-16 text-center bg-background border border-border rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-40"
                                />
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium">
                                KES {(line.unit_price ?? 0).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">No line items found on this order.</p>
              )}
            </div>
          )}

          {/* Return type */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Return Type</label>
            <div className="flex gap-2 mt-1">
              {RETURN_TYPES.map((rt) => (
                <button
                  key={rt.value}
                  type="button"
                  onClick={() => setReturnType(rt.value)}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors',
                    returnType === rt.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {rt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Refund method / channel — for refund & store-credit returns. Options are
              narrowed by the reason + on-account policy (server enforces the same). */}
          {returnType !== 'exchange' && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Refund Method</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {channelOptions.map((ch) => (
                  <button
                    key={ch.value}
                    type="button"
                    onClick={() => setRefundChannel(ch.value)}
                    className={cn(
                      'px-3 py-2 rounded-xl text-xs font-semibold border transition-colors',
                      refundChannel === ch.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {ch.label}
                  </button>
                ))}
              </div>
              {channelAdvisory && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                  {channelAdvisory}
                </p>
              )}
            </div>
          )}

          {/* Exchange top-up — collect the price difference when the replacement is pricier */}
          {returnType === 'exchange' && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                Top-up to Collect <span className="font-normal">(optional — if replacement is pricier)</span>
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">KES</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-background border border-border rounded-xl py-2.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
          )}

          {/* Reason */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Return Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full bg-background border border-border rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                Reason Code <span className="font-normal">(optional)</span>
              </label>
              <select
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                className="mt-1 w-full bg-background border border-border rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {REASON_CODES.map((rc) => <option key={rc.value} value={rc.value}>{rc.label}</option>)}
              </select>
            </div>
          </div>

          {isError && <p className="text-xs text-red-500">Failed to initiate return. Please try again.</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !selectedOrder || selectedCount === 0}
              className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Submitting…' : `Submit Return${selectedCount > 0 ? ` (${selectedCount} item${selectedCount > 1 ? 's' : ''})` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ReturnByInvoiceModal looks a sale up by its exact receipt/invoice number (pos-api
// GET /pos/orders/by-number/{n}) and initiates a full return for it — the godigital
// "Sell Return by Invoice No." flow. Partial / line-level returns use Initiate Return.
function ReturnByInvoiceModal({ onClose, initialInvoice = '' }: { onClose: () => void; initialInvoice?: string }) {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  // Seed from initialInvoice so the terminal "Sell Return" flow (which passes ?invoice=) looks the
  // sale up immediately instead of dumping the cashier on an empty list.
  const [invoiceNo, setInvoiceNo] = useState(initialInvoice);
  const [query, setQuery] = useState(initialInvoice.trim());
  const [returnType, setReturnType] = useState('refund');
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [refundChannel, setRefundChannel] = useState('cash');
  const initiate = useInitiateReturn();

  const { data: order, isFetching, isError } = useQuery({
    queryKey: ['order-by-number', tenantID, query],
    queryFn: () => apiClient.get<any>(`/api/v1/${tenantID}/pos/orders/by-number/${encodeURIComponent(query)}`),
    enabled: !!tenantID && !!query,
    retry: false,
    staleTime: 30_000,
  });

  const lines: any[] = order?.edges?.lines ?? order?.lines ?? [];

  // On-account (credit-sale) detection + reason-based channel policy (mirrors the server).
  const { data: byInvPayments } = useQuery({
    queryKey: ['pos-order-payments', tenantID, order?.id],
    queryFn: () => apiClient.get<any>(`/api/v1/${tenantID}/pos/orders/${order.id}/payments`),
    enabled: !!tenantID && !!order?.id,
    staleTime: 60_000,
  });
  const onAccount = ((byInvPayments as any)?.data ?? []).some(
    (p: any) => p.tender_type === 'on_account' && p.status === 'completed',
  );
  const channelOptions = allowedRefundChannels(undefined, onAccount);
  const channelAdvisory = refundChannelAdvisory(undefined, onAccount);
  useEffect(() => {
    if (returnType !== 'exchange' && !channelOptions.some((c) => c.value === refundChannel)) {
      setRefundChannel(defaultRefundChannel(returnType, onAccount));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAccount, returnType]);

  async function handleProcess() {
    if (!order) return;
    const payload: InitiateReturnPayload = {
      return_type: returnType,
      reason,
      ...(returnType === 'exchange' ? {} : { refund_channel: refundChannel }),
      lines: lines.map((l) => ({
        order_line_id: l.id,
        sku: l.sku ?? '',
        name: l.name ?? l.item_name ?? '',
        quantity: l.quantity ?? 1,
        unit_price: l.unit_price ?? 0,
        total_price: (l.unit_price ?? 0) * (l.quantity ?? 1),
      })),
    };
    try {
      await initiate.mutateAsync({ orderId: order.id, payload });
      toast.success(`Return initiated for ${order.order_number}`);
      onClose();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to initiate return'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <RotateCcw className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-base">Return by Invoice</h2>
            <p className="text-xs text-muted-foreground">Look up a sale by its receipt / invoice number</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="e.g. POS-000123"
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setQuery(invoiceNo.trim()); }}
            className="flex-1 bg-background border border-border rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setQuery(invoiceNo.trim())}
            disabled={!invoiceNo.trim()}
            className="px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 flex items-center"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Find'}
          </button>
        </div>

        {query && !isFetching && (isError || !order) && (
          <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600">
            No sale found for &ldquo;{query}&rdquo;.
          </div>
        )}

        {order && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-3">
              <p className="text-sm font-bold font-mono">{order.order_number}</p>
              <p className="text-xs text-muted-foreground">
                {order.created_at ? new Date(order.created_at).toLocaleString() : ''} · KES{' '}
                {(order.total_amount ?? 0).toLocaleString()} · {order.status}
              </p>
              <div className="mt-2 space-y-1">
                {lines.map((l) => (
                  <div key={l.id} className="flex justify-between text-xs">
                    <span className="truncate">{(l.name ?? l.item_name ?? l.sku)} × {l.quantity ?? 1}</span>
                    <span className="tabular-nums">KES {((l.unit_price ?? 0) * (l.quantity ?? 1)).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Return type</span>
                <select
                  value={returnType}
                  onChange={(e) => setReturnType(e.target.value)}
                  className="mt-1 w-full bg-background border border-border rounded-xl py-2 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="refund">Refund</option>
                  <option value="store_credit">Store credit</option>
                  <option value="exchange">Exchange</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Reason</span>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full bg-background border border-border rounded-xl py-2 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            </div>

            {returnType !== 'exchange' && (
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Refund method</span>
                <select
                  value={refundChannel}
                  onChange={(e) => setRefundChannel(e.target.value)}
                  className="mt-1 w-full bg-background border border-border rounded-xl py-2 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {channelOptions.map((ch) => <option key={ch.value} value={ch.value}>{ch.label}</option>)}
                </select>
                {channelAdvisory && (
                  <span className="block text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                    {channelAdvisory}
                  </span>
                )}
              </label>
            )}

            <button
              type="button"
              onClick={handleProcess}
              disabled={initiate.isPending || lines.length === 0}
              className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-primary/90 transition-colors"
            >
              {initiate.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Process full return
            </button>
          </div>
        )}

        <button onClick={onClose} className="w-full py-2 mt-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          Close
        </button>
      </div>
    </div>
  );
}

function ReturnsPage() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [showModal, setShowModal] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoicePrefill, setInvoicePrefill] = useState('');
  const [customerModal, setCustomerModal] = useState<{ name?: string | null; phone: string } | null>(null);
  const { data, isLoading } = useReturns(statusFilter);
  const returns = data?.data ?? [];
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = params?.orgSlug ?? '';

  // Terminal top-bar "Sell Return" and other entry points deep-link here with ?invoice=<no.>.
  // Open the Return-by-Invoice modal prefilled + auto-searching, then strip the param so a refresh
  // or close doesn't reopen it.
  const invoiceParam = searchParams?.get('invoice') ?? '';
  useEffect(() => {
    if (!invoiceParam) return;
    setInvoicePrefill(invoiceParam);
    setShowInvoice(true);
    router.replace(`/${orgSlug}/returns`);
  }, [invoiceParam, orgSlug, router]);

  return (
    <div className="p-6">
      {showModal && <InitiateReturnModal onClose={() => setShowModal(false)} />}
      {showInvoice && (
        <ReturnByInvoiceModal
          initialInvoice={invoicePrefill}
          onClose={() => { setShowInvoice(false); setInvoicePrefill(''); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <RotateCcw className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Returns</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Process refunds and manage return requests</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowInvoice(true)}
            className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-secondary/80 transition-colors"
          >
            <Search className="h-4 w-4" />
            Return by Invoice
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Initiate Return
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
              statusFilter === f.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading returns…</span>
        </div>
      ) : returns.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <RotateCcw className="h-10 w-10 opacity-30" />
          <p className="font-medium">No return requests found</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Return #</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Customer</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Reason</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Refund</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Method</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {returns.map((ret) => {
                const cfg = STATUS_CONFIG[ret.status] ?? { label: ret.status, className: 'bg-muted text-muted-foreground' };
                return (
                  <tr
                    key={ret.id}
                    className="hover:bg-accent/20 transition-colors cursor-pointer"
                    onClick={() => router.push(`/${orgSlug}/returns/${ret.id}`)}
                  >
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-primary underline-offset-2 hover:underline">{ret.return_number}</td>
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      {ret.customer_phone ? (
                        <button type="button"
                          onClick={() => setCustomerModal({ name: ret.customer_name, phone: ret.customer_phone })}
                          className="text-primary hover:underline" title="Open customer profile">
                          {ret.customer_name || ret.customer_phone}
                        </button>
                      ) : (ret.customer_name ?? '—')}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground max-w-[180px] truncate">{ret.reason}</td>
                    <td className="px-4 py-3.5">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border border-transparent', cfg.className)}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold">
                      {ret.refund_amount != null
                        ? `${ret.currency ?? 'KES'} ${ret.refund_amount.toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground text-xs capitalize">
                      {(ret.refund_channel ?? ret.refund_method)?.replace('_', ' ') ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground text-xs">
                      {new Date(ret.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {customerModal && (
        <CustomerDetailsModal
          customerName={customerModal.name}
          customerPhone={customerModal.phone}
          onClose={() => setCustomerModal(null)}
        />
      )}
    </div>
  );
}

export default function ReturnsPageGated() {
  return (
    <ModuleGate moduleKey="returns" fallback={<ModuleUnavailablePage moduleKey="returns" />}>
      <ReturnsPage />
    </ModuleGate>
  );
}
