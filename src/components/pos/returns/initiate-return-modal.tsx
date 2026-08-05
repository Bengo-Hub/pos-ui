'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableCombobox, type ComboboxOption } from '@bengo-hub/shared-ui-lib/combobox';

import { apiClient } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useEffectiveOnline } from '@/lib/connectivity';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { allowedRefundChannels, defaultRefundChannel, refundChannelAdvisory } from '@/lib/returns-policy';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

export interface ReturnLinePayload {
  order_line_id: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface InitiateReturnPayload {
  return_type: string;
  reason: string;
  reason_code?: string;
  refund_channel?: string;
  lines: ReturnLinePayload[];
}

// Refund channels + reason policy live in the shared lib (mirrors pos-api returns_policy.go).

export function useInitiateReturn() {
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

export const RETURN_REASONS = [
  'Defective / damaged',
  'Wrong item received',
  'Changed mind',
  'Duplicate purchase',
  'Item not as described',
  'Other',
];
export const REASON_CODES: { value: string; label: string }[] = [
  { value: '',             label: '— Select code —'  },
  { value: 'changed_mind', label: 'Changed mind'      },
  { value: 'defective',    label: 'Defective item'    },
  { value: 'damaged',      label: 'Damaged item'      },
  { value: 'wrong_item',   label: 'Wrong item'        },
  { value: 'expired',      label: 'Expired product'   },
  { value: 'other',        label: 'Other'             },
];
// "Store Credit" is deliberately NOT its own Return Type button — it used to sit alongside
// Refund/Exchange here AND appear again in the Refund Method row below, so a cashier could pick
// either "Return Type: Store Credit" or "Return Type: Refund" + "Method: Store Credit" for the
// exact same outcome (the backend treats them as equivalent — see wantsStoreCredit in
// returns_policy.go, which folds returnType=='store_credit' and channel=='store_credit' into one
// check). Keeping only Refund/Exchange here and letting the Refund Method row be the ONE place
// "give it as credit instead of cash" gets decided removes that duplicate, confusing choice.
const RETURN_TYPES: { value: string; label: string }[] = [
  { value: 'refund',   label: 'Refund'   },
  { value: 'exchange', label: 'Exchange' },
];

// InitiateReturnModal is the ONE return-initiation surface for the whole app — shared so every
// caller (the Returns page header, and the Sell-Details "Sell Return" action) opens the exact
// same modal instead of each maintaining its own copy. initialOrderNumber optionally pre-loads a
// specific sale (exact by-number lookup) so a deep-linked/inline open lands on a ready-to-submit
// return instead of an empty search box — a full return is then just "leave every line checked".
export function InitiateReturnModal({
  onClose,
  initialOrderNumber,
}: {
  onClose: () => void;
  initialOrderNumber?: string;
}) {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  const { data: posSettings } = usePOSSettings();
  const restrictOnAccount = posSettings?.restrict_credit_sale_refund_to_offset ?? true;
  const currency = (posSettings as any)?.currency ?? 'KES';

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [comboValue, setComboValue] = useState('');
  const [selectedLines, setSelectedLines] = useState<Record<string, { checked: boolean; qty: number }>>({});
  const [loadingInitial, setLoadingInitial] = useState(!!initialOrderNumber);
  // The combobox only returns {value,label,hint,description} on select — keep the full fetched
  // order objects (lines, status, etc.) keyed by id so selecting a result can populate the items
  // table without a second round-trip.
  const foundOrdersRef = useRef<Map<string, any>>(new Map());

  const [returnType, setReturnType] = useState('refund');
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [reasonCode, setReasonCode] = useState('');
  const [refundChannel, setRefundChannel] = useState('cash');
  // Exchange top-up: amount to collect from the customer when the replacement is pricier than the
  // returned goods. Recorded in the return reason so the cashier/accounting has a trail.
  const [topUpAmount, setTopUpAmount] = useState('');

  const { mutate, isPending, isError } = useInitiateReturn();

  function applySelectedOrder(order: any) {
    setSelectedOrder(order);
    setComboValue(order.id);
    const lines: any[] = order.edges?.lines ?? order.lines ?? [];
    const init: Record<string, { checked: boolean; qty: number }> = {};
    lines.forEach((l: any) => { init[l.id] = { checked: true, qty: l.quantity ?? 1 }; });
    setSelectedLines(init);
  }

  // Deep-link / inline-open entry (Sell Details "Sell Return", or the Returns page's
  // ?invoice=<no.> param): look the sale up by its exact number and auto-select it.
  useEffect(() => {
    if (!initialOrderNumber || !tenantID) {
      setLoadingInitial(false);
      return;
    }
    let active = true;
    apiClient
      .get<any>(`/api/v1/${tenantID}/pos/orders/by-number/${encodeURIComponent(initialOrderNumber)}`)
      .then((order) => {
        if (active && order) {
          foundOrdersRef.current.set(order.id, order);
          applySelectedOrder(order);
        }
      })
      .catch(() => { if (active) toast.error(`No sale found for "${initialOrderNumber}"`); })
      .finally(() => { if (active) setLoadingInitial(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrderNumber, tenantID]);

  async function searchOrders(query: string): Promise<ComboboxOption[]> {
    if (!tenantID || query.trim().length < 2) return [];
    const res = await apiClient.get<{ data: any[] }>(
      `/api/v1/${tenantID}/pos/orders`,
      { order_number: query, limit: 8 } as any,
    );
    const rows: any[] = (res as any)?.data ?? [];
    return rows.map((o) => {
      foundOrdersRef.current.set(o.id, o);
      const when = o.created_at ? new Date(o.created_at).toLocaleDateString() : '';
      return {
        value: o.id,
        label: o.order_number,
        hint: formatCurrency(o.total_amount ?? 0, currency),
        description: `${o.customer_name || 'Walk-in customer'}${when ? ` · ${when}` : ''}`,
      };
    });
  }

  function handleComboChange(value: string) {
    setComboValue(value);
    if (!value) {
      setSelectedOrder(null);
      setSelectedLines({});
      return;
    }
    const order = foundOrdersRef.current.get(value);
    if (order) applySelectedOrder(order);
  }

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
  const channelOptions = allowedRefundChannels(reasonCode || undefined, onAccount, restrictOnAccount);
  const channelAdvisory = refundChannelAdvisory(reasonCode || undefined, onAccount, restrictOnAccount);
  // Keep the selection valid when the reason/on-account context narrows the options.
  useEffect(() => {
    if (returnType !== 'exchange' && !channelOptions.some((c) => c.value === refundChannel)) {
      setRefundChannel(defaultRefundChannel(returnType, onAccount));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reasonCode, onAccount, returnType, restrictOnAccount]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrder) return;
    const lines: any[] = selectedOrder.edges?.lines ?? selectedOrder.lines ?? [];
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
      topUp > 0 ? `${reason} · Exchange top-up collected: ${formatCurrency(topUp, currency)}` : reason;
    // The API still stores a distinct "store_credit" return_type for reporting — derive it from
    // the Refund Method choice rather than a separate Return Type button (see the RETURN_TYPES
    // comment above for why the two were merged).
    const effectiveReturnType = returnType === 'refund' && refundChannel === 'store_credit' ? 'store_credit' : returnType;
    mutate(
      {
        orderId: selectedOrder.id,
        payload: {
          return_type: effectiveReturnType,
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

  const orderLines: any[] = selectedOrder?.edges?.lines ?? selectedOrder?.lines ?? [];
  const selectedCount = Object.values(selectedLines).filter((s) => s.checked).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      {/* stopPropagation: this modal is sometimes rendered nested inside another modal's own
          backdrop (e.g. SellDetailsModal's "Sell Return" action) which closes itself on any click
          that bubbles to it — without this, clicking into a field here (even just to focus it
          before typing) closed BOTH modals. */}
      <div
        className="bg-background rounded-2xl border border-border shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="text-base font-bold">Initiate Return</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-xl hover:bg-accent flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Order search — searchable combobox showing the order number, customer, and amount
              per result so the cashier can confirm they've got the right sale before selecting. */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Search Order</label>
            <div className="mt-1">
              <SearchableCombobox
                options={[]}
                value={comboValue}
                onChange={handleComboChange}
                onRemoteSearch={searchOrders}
                placeholder={loadingInitial ? 'Loading sale…' : 'Search by order # or receipt number…'}
                searchPlaceholder="Type order # or receipt number…"
                emptyText="No matching sales"
                disabled={loadingInitial}
                clearable
              />
            </div>
          </div>

          {/* Selected order + items table */}
          {selectedOrder && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
                <div>
                  <p className="text-sm font-bold font-mono">{selectedOrder.order_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(selectedOrder.created_at).toLocaleDateString()} · {formatCurrency(selectedOrder.total_amount ?? 0, currency)}
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
                                {formatCurrency(line.unit_price ?? 0, currency)}
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
                    title={ch.hint}
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
              {channelOptions.find((c) => c.value === refundChannel)?.hint && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {channelOptions.find((c) => c.value === refundChannel)?.hint}
                </p>
              )}
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
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{currency}</span>
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
