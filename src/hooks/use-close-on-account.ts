'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';

/** Whether a sale still owes money and is NOT already booked on account (so it can be put on account). */
export function canPutOnAccount(order: any): boolean {
  if (!order) return false;
  const owing = ['due', 'partial', 'overdue'].includes(order.payment_status) && (order.amount_due ?? 0) > 0.01;
  const alreadyOnAccount = order.metadata?.on_account === true;
  const hasCustomer = !!(order.customer_phone && String(order.customer_phone).trim());
  return owing && !alreadyOnAccount && hasCustomer;
}

/**
 * useCloseOnAccount — books a partially-paid (or unpaid) sale's OUTSTANDING balance to the
 * customer's treasury AR as a credit sale and finalizes the sale, so the debtor appears (and is
 * collectible) on the treasury Customers page. Mirrors the credit-sale flow the till uses; the
 * server resolves the customer + enforces the credit limit.
 */
export function useCloseOnAccount() {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (vars: { orderId: string; paymentDueDate?: string; notes?: string }) =>
      apiClient.post(`/api/v1/${tenantID}/pos/orders/${vars.orderId}/close-on-account`, {
        paymentDueDate: vars.paymentDueDate,
        notes: vars.notes,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['pos-orders'] });
    },
  });
}
