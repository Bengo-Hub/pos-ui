'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Badge, Button } from '@/components/ui/base';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ReceiptPreview } from '@/components/pos/receipt-preview';
import {
  useLayawayPlan,
  useRecordLayawayPayment,
  useCancelLayaway,
  useCompleteLayaway,
  type LayawayPlan,
  type RecordPaymentInput,
} from '@/hooks/useLayaway';
import { useReceiptAfterSale } from '@/hooks/use-receipt-after-sale';
import { resolveBillProfile } from '@/lib/pos/printer-stations';
import { cn, formatCurrency } from '@/lib/utils';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { useAuthStore } from '@/store/auth';
import { AlertTriangle, Loader2, PackageCheck, X } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { nowDatetimeLocal, datetimeLocalToISO } from '@bengo-hub/shared-ui-lib/payments';
import { buildLayawayPaymentColumns } from './payment-columns';

function statusVariant(status: LayawayPlan['status']): 'default' | 'success' | 'outline' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'outline';
  return 'default';
}

const PAYMENT_METHODS = ['cash', 'mpesa', 'card'] as const;

function LayawayDetailPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const id = params?.id as string;
  const router = useRouter();

  const { data: plan, isLoading } = useLayawayPlan(id);
  const recordPayment = useRecordLayawayPayment(id);
  const cancelPlan = useCancelLayaway();
  const completePlan = useCompleteLayaway(id);
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const paymentColumns = useMemo(() => buildLayawayPaymentColumns(currency), [currency]);

  // ── Printable receipts ──────────────────────────────────────────────────────
  // Three documents come off a layaway, all rendered by the SHARED ReceiptPreview:
  //  · the opening DEPOSIT slip (plan-level endpoint), raised right after Create — the list
  //    page navigates here with ?deposit_receipt=1 so the slip prints on the plan it belongs to;
  //  · one INSTALMENT slip per recorded payment (payment-level endpoint);
  //  · the ordinary SALE receipt for the POSOrder that Complete / Hand Over raises.
  // Only the last is a fiscalised sale, so only it goes through showReceiptForOrder (which runs
  // the eTIMS merge); the two plan slips use the generic showReceiptFromEndpoint.
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? '');
  const authUser = useAuthStore((s) => s.user);
  const {
    receiptData, receiptOpen, receiptOrderId,
    showReceiptForOrder, showReceiptFromEndpoint, closeReceipt,
  } = useReceiptAfterSale(tenantId, authUser?.fullName || authUser?.email);

  const searchParams = useSearchParams();
  const depositReceiptRequested = searchParams.get('deposit_receipt') === '1';
  const depositReceiptFiredRef = useRef(false);
  useEffect(() => {
    if (!depositReceiptRequested || depositReceiptFiredRef.current || !tenantId || !id) return;
    depositReceiptFiredRef.current = true;
    void showReceiptFromEndpoint(`/api/v1/${tenantId}/pos/layaways/${id}/receipt`);
    // Drop the flag so a refresh (or a later visit) doesn't re-raise the deposit slip.
    router.replace(`/${orgSlug}/layaway/${id}`);
  }, [depositReceiptRequested, tenantId, id, orgSlug, router, showReceiptFromEndpoint]);

  const [completeOpen, setCompleteOpen] = useState(false);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const emptyPaymentForm = (): RecordPaymentInput & { paidAtLocal: string } => ({
    amount: 0,
    payment_method: 'cash',
    reference: '',
    notes: '',
    paidAtLocal: nowDatetimeLocal(),
  });
  const [paymentForm, setPaymentForm] = useState<RecordPaymentInput & { paidAtLocal: string }>(emptyPaymentForm);
  const [cancelOpen, setCancelOpen] = useState(false);

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.amount || paymentForm.amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    recordPayment.mutate(
      {
        amount: Number(paymentForm.amount),
        payment_method: paymentForm.payment_method,
        reference: paymentForm.reference || undefined,
        notes: paymentForm.notes || undefined,
        paid_at: datetimeLocalToISO(paymentForm.paidAtLocal),
      },
      {
        onSuccess: (res) => {
          toast.success('Payment recorded');
          setPaymentOpen(false);
          setPaymentForm(emptyPaymentForm());
          // Instalment slip for the payment just taken (not a fiscalised sale — no eTIMS merge).
          const paymentId = res?.payment?.id;
          if (paymentId) {
            void showReceiptFromEndpoint(`/api/v1/${tenantId}/pos/layaways/${id}/payments/${paymentId}/receipt`);
          }
        },
        onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to record payment')),
      }
    );
  };

  // Complete / Hand Over — the goods physically leave with the customer. pos-api raises the
  // POSOrder here (GL + stock + eTIMS all fire off it), so this is a real financial action and
  // gets a ConfirmDialog like every other sensitive action in the codebase.
  const handleComplete = () => {
    completePlan.mutate(undefined, {
      onSuccess: (res) => {
        setCompleteOpen(false);
        toast.success(res?.order_number ? `Layaway completed · ${res.order_number}` : 'Layaway completed');
        if (res?.order_id) void showReceiptForOrder(res.order_id);
      },
      onError: async (e) => {
        setCompleteOpen(false);
        toast.error(await apiErrorMessage(e, 'Failed to complete the layaway'));
      },
    });
  };

  const handleCancel = () => {
    cancelPlan.mutate(id, {
      onSuccess: (res) => {
        if (res?.warning) {
          // Cancellation still went through -- only the deposit refund needs a human to sort out.
          toast.warning(res.warning, { duration: 10000 });
        } else {
          toast.success('Layaway plan cancelled and deposit refunded');
        }
        setCancelOpen(false);
      },
      onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to cancel plan')),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>Plan not found.</p>
        <button onClick={() => router.back()} className="text-sm text-primary underline mt-2">Go back</button>
      </div>
    );
  }

  const progressPct = Math.min(100, (plan.paid_amount / plan.total_amount) * 100);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{plan.customer_name}</h1>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <Badge
              variant={statusVariant(plan.status)}
              className={cn(plan.status === 'active' && 'bg-blue-500/10 text-blue-600 border-blue-500/20')}
            >
              {plan.status}
            </Badge>
            {plan.customer_phone && (
              <span className="text-sm text-muted-foreground">{plan.customer_phone}</span>
            )}
            {plan.customer_email && (
              <span className="text-sm text-muted-foreground">{plan.customer_email}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {plan.status === 'active' && (
            <>
              <Button onClick={() => setPaymentOpen(true)} className="min-h-10 px-4">
                Record Payment
              </Button>
              <Button variant="destructive" className="min-h-10 px-4" onClick={() => setCancelOpen(true)}>
                Cancel Plan
              </Button>
            </>
          )}
          {/* Paid off in full (status flips to completed once remaining hits 0) but no order
              raised yet — the goods are still on the shelf awaiting hand-over. */}
          {plan.status === 'completed' && !plan.order_id && (
            <Button className="min-h-10 px-4" onClick={() => setCompleteOpen(true)} disabled={completePlan.isPending}>
              {completePlan.isPending
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <PackageCheck className="h-4 w-4 mr-2" />}
              Complete / Hand Over
            </Button>
          )}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total</p>
            <p className="text-xl font-bold font-mono">{formatCurrency(plan.total_amount, currency)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Paid</p>
            <p className="text-xl font-bold font-mono text-green-600">{plan.paid_amount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Remaining</p>
            <p className="text-xl font-bold font-mono text-amber-600">{plan.remaining_amount.toLocaleString()}</p>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Progress</span>
            <span>{progressPct.toFixed(0)}%</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        {plan.due_date && (
          <p className="text-sm text-muted-foreground">
            Due: <span className="font-semibold text-foreground">{new Date(plan.due_date).toLocaleDateString()}</span>
          </p>
        )}
        {plan.notes && <p className="text-sm text-muted-foreground italic">{plan.notes}</p>}
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-bold text-base">Payment History</h2>
        </div>
        <div className="px-2 pb-2">
          <DataTable
            columns={paymentColumns}
            rows={plan.payments ?? []}
            rowKey={(p) => p.id}
            storageKey="layaway-payments-col-prefs"
            emptyText="No payments recorded yet."
          />
        </div>
      </div>

      {/* Record Payment Modal */}
      {paymentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-base">Record Payment</h3>
              <button onClick={() => setPaymentOpen(false)} className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Amount ({currency}) <span className="text-destructive">*</span>
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  value={paymentForm.amount || ''}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.valueAsNumber }))}
                  placeholder="0"
                  className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Payment Method <span className="text-destructive">*</span>
                </label>
                <div className="flex gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentForm((p) => ({ ...p, payment_method: m }))}
                      className={cn(
                        'flex-1 py-2 rounded-xl border-2 text-sm font-semibold capitalize transition-all',
                        paymentForm.payment_method === m
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/30'
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Payment date &amp; time <span className="text-destructive">*</span>
                </label>
                <input
                  required
                  type="datetime-local"
                  value={paymentForm.paidAtLocal}
                  max={nowDatetimeLocal()}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, paidAtLocal: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Reference</label>
                <input
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, reference: e.target.value }))}
                  placeholder="Transaction ref…"
                  className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Notes</label>
                <input
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional notes…"
                  className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1 min-h-11" onClick={() => setPaymentOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 min-h-11" disabled={recordPayment.isPending}>
                  {recordPayment.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Record
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Confirm Modal */}
      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6 shadow-2xl text-center">
            <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <h3 className="font-bold text-base mb-2">Cancel Layaway Plan?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              This will cancel the plan for <strong>{plan.customer_name}</strong>. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 min-h-11" onClick={() => setCancelOpen(false)}>
                Keep Plan
              </Button>
              <Button variant="destructive" className="flex-1 min-h-11" disabled={cancelPlan.isPending} onClick={handleCancel}>
                {cancelPlan.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Cancel Plan
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Complete / Hand Over confirm — raising the sale posts to the GL, moves stock and
          fiscalises with KRA, so it gets the standard confirmation step. */}
      <ConfirmDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        title="Hand over the goods?"
        description={`${plan.customer_name} has paid this plan off in full. Completing raises the sale (stock, accounts and KRA eTIMS all post against it) and prints the receipt. This cannot be undone.`}
        confirmLabel="Complete & Print"
        variant="warning"
        loading={completePlan.isPending}
        onConfirm={handleComplete}
      />

      {/* One preview for all three layaway documents (deposit slip, instalment slip, and the
          completion sale receipt) — mounted exactly like the POS terminal's. orderId is only
          set for the completion receipt; the plan slips have no order to print ESC/POS from. */}
      <ReceiptPreview
        receipt={receiptData}
        open={receiptOpen}
        onClose={closeReceipt}
        printerProfile={resolveBillProfile((posSettings as any)?.printer_profiles)}
        tenantId={tenantId}
        orderId={receiptOrderId}
        autoPrint={Boolean((posSettings as any)?.auto_print_order) && !(posSettings as any)?.print_agent_online}
      />
    </div>
  );
}

export default function LayawayDetailPageGated() {
  return (
    <ModuleGate moduleKey="layaway" fallback={<ModuleUnavailablePage moduleKey="layaway" />}>
      <LayawayDetailPage />
    </ModuleGate>
  );
}
