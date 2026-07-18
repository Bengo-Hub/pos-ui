'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useTenders } from '@/hooks/usePOS';
import { useAuthStore } from '@/store/auth';

const FALLBACK_TENDER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Every settlement method the platform supports for collecting an on-account balance.
 * Mirrors the terminal's tender buttons (minus on_account/complimentary, which are not
 * settlement methods) — treasury records the same method string on the AR receipt.
 */
const SETTLE_METHODS: { value: string; label: string; needsRef?: boolean; refLabel?: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'mpesa_manual', label: 'M-Pesa code (sighted)', needsRef: true, refLabel: 'M-Pesa transaction code' },
  { value: 'card_manual', label: 'Card (PDQ)', needsRef: true, refLabel: 'Card slip / auth reference' },
  { value: 'bank', label: 'Bank transfer', needsRef: true, refLabel: 'Bank reference' },
  { value: 'cheque', label: 'Cheque', needsRef: true, refLabel: 'Cheque number' },
  { value: 'paystack', label: 'Paystack (already received)', needsRef: true, refLabel: 'Paystack reference' },
];

interface SettleCreditResult {
  amount_applied: number;
  outstanding_after: number;
  payment_status: string;
  treasury_synced: boolean;
}

/**
 * RecordPaymentModal — settles (part of) a completed on-account (credit) sale from the
 * back-office: POST /orders/{id}/payments/settle-credit records the collected tender and
 * posts the AR receipt in treasury. Reused by the All-Sales actions menu, the sale details
 * modal and the customer details modal.
 */
export function RecordPaymentModal({
  order,
  onClose,
  onDone,
}: {
  order: any;
  onClose: () => void;
  onDone?: () => void;
}) {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const qc = useQueryClient();
  const { data: tendersData } = useTenders();

  const outstanding = useMemo(() => {
    const due = order.amount_due ?? Math.max((order.total_amount ?? 0) - (order.total_paid ?? order.paid_total ?? 0), 0);
    return Math.round(due * 100) / 100;
  }, [order]);

  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState(String(outstanding));
  const [externalRef, setExternalRef] = useState('');
  const methodDef = SETTLE_METHODS.find((m) => m.value === method);

  const tenderId = useMemo(() => {
    const tenders: any[] = (tendersData as any)?.data ?? [];
    const active = tenders.find((t) => t.is_active) ?? tenders[0];
    return active?.id ?? FALLBACK_TENDER_ID;
  }, [tendersData]);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post<SettleCreditResult>(
        `/api/v1/${tenantID}/pos/orders/${order.id}/payments/settle-credit`,
        {
          tenderId,
          tenderMethod: method,
          amount: parseFloat(amount) || 0,
          externalRef: externalRef.trim() || undefined,
        },
      ),
    onSuccess: (res) => {
      if (res.treasury_synced) {
        toast.success(
          res.payment_status === 'paid'
            ? `${order.order_number} fully settled`
            : `Payment recorded — ${res.outstanding_after.toLocaleString()} still outstanding`,
        );
      } else {
        toast.warning('Payment recorded at the till, but the treasury balance did not update — re-record it from the treasury Customers page.');
      }
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['pos-orders'] });
      onDone?.();
      onClose();
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to record the payment')),
  });

  const amt = parseFloat(amount) || 0;
  const canSubmit = amt > 0 && amt <= outstanding + 0.01 && (!methodDef?.needsRef || externalRef.trim().length > 0);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => !mutation.isPending && onClose()}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Banknote className="h-4 w-4 text-primary" /> Record payment
          </h2>
          <button onClick={onClose} disabled={mutation.isPending} className="p-1 rounded hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
            <p className="font-bold">{order.order_number}</p>
            <p className="text-xs text-muted-foreground">
              {order.customer_name || 'Customer'} · outstanding{' '}
              <span className="font-semibold text-amber-600">{outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Payment method</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {SETTLE_METHODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMethod(m.value)}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm font-semibold text-left',
                    method === m.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Amount</label>
            <input
              type="number"
              inputMode="decimal"
              min={0.01}
              max={outstanding}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-0.5 text-[11px] text-muted-foreground">Defaults to the full outstanding balance; partial payments allowed.</p>
          </div>

          {methodDef?.needsRef && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground">{methodDef.refLabel}</label>
              <input
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
                placeholder={methodDef.refLabel}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
          )}

          <button
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="w-full rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Record {amt > 0 ? amt.toLocaleString(undefined, { maximumFractionDigits: 2 }) : ''} payment
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
