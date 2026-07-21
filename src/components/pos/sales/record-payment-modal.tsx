'use client';

import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SettlementModal, SETTLE_CREDIT_SALE_METHODS } from '@bengo-hub/shared-ui-lib/payments';
import { apiClient } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useTenders } from '@/hooks/usePOS';
import { useAuthStore } from '@/store/auth';

const FALLBACK_TENDER_ID = '00000000-0000-0000-0000-000000000000';

interface SettleCreditResult {
  amount_applied: number;
  outstanding_after: number;
  payment_status: string;
  treasury_synced: boolean;
}

/**
 * RecordPaymentModal — settles (part of) a completed on-account (credit) sale from the
 * back-office: POST /orders/{id}/payments/settle-credit records the collected tender and posts
 * the AR receipt in treasury. A thin wrapper over the shared SettlementModal
 * (@bengo-hub/shared-ui-lib/payments) — the SAME component treasury-ui's customer AR modals use
 * — so a payment recorded here reads identically to one recorded from the treasury Customers
 * page. Reused by the All-Sales actions menu, the sale details modal and the customer details
 * modal.
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

  const tenderId = useMemo(() => {
    const tenders: any[] = (tendersData as any)?.data ?? [];
    const active = tenders.find((t) => t.is_active) ?? tenders[0];
    return active?.id ?? FALLBACK_TENDER_ID;
  }, [tendersData]);

  const mutation = useMutation({
    mutationFn: (input: { amount: number; method?: string; reference?: string }) =>
      apiClient.post<SettleCreditResult>(
        `/api/v1/${tenantID}/pos/orders/${order.id}/payments/settle-credit`,
        {
          tenderId,
          tenderMethod: input.method,
          amount: input.amount,
          externalRef: input.reference,
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
  });

  return (
    <SettlementModal
      open
      mode="receive"
      title="Record payment"
      subjectName={`${order.order_number} · ${order.customer_name || 'Customer'}`}
      amountLabel="Outstanding"
      amountValue={outstanding}
      defaultAmount={outstanding}
      maxAmount={outstanding}
      methods={SETTLE_CREDIT_SALE_METHODS}
      isPending={mutation.isPending}
      onClose={onClose}
      onSubmit={(input) =>
        new Promise((resolve, reject) => {
          mutation.mutate(input, {
            onSuccess: () => resolve(),
            onError: async (e) => reject(new Error(await apiErrorMessage(e, 'Failed to record the payment'))),
          });
        })
      }
    />
  );
}
