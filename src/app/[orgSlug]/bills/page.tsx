'use client';

import { useState } from 'react';
import { PageGuard } from '@/components/auth/page-guard';
import { Can } from '@/components/auth/can';
import { P } from '@/lib/rbac/permissions';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { usePharmacyBills } from '@/hooks/useClinical';
import { useCheckoutPrescription, useDispensePrescription } from '@/hooks/usePharmacy';
import { SplitPaymentModal } from '@/components/pos/split-payment-modal';
import { useAuthStore } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import { CreditCard, Loader2, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { PharmacyBill } from '@/lib/api/clinical';

/**
 * Cashier-facing bills queue — the "billing" pharmacy workflow mode.
 *
 * A prescriber approves a script and it lands here; ANY cashier can then settle it and hand over
 * the medicine, exactly like a waiter posting an order that any cashier clears. Small chemists run
 * "direct" mode instead (same person prescribes and takes payment straight from the prescription
 * page) and simply never use this screen.
 */
function BillsPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const { data: bills, isLoading } = usePharmacyBills();
  const checkout = useCheckoutPrescription();
  const dispense = useDispensePrescription();
  const [paymentOrder, setPaymentOrder] = useState<{ id: string; order_number: string; total: number; prescriptionId: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const tenantSlug = useAuthStore((s) => s.user?.tenant_slug ?? orgSlug);
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? '');

  const handleCollect = async (bill: PharmacyBill) => {
    const rx = bill.prescription;
    setBusyId(rx.id);
    try {
      // Already checked out (order exists but unpaid) → go straight to payment.
      if (bill.order_id) {
        setPaymentOrder({
          id: bill.order_id,
          order_number: rx.prescription_number,
          total: bill.order_total ?? bill.estimated_total,
          prescriptionId: rx.id,
        });
        return;
      }
      const res = await checkout.mutateAsync(rx.id);
      setPaymentOrder({
        id: res.order_id,
        order_number: res.order_number,
        total: res.total_amount,
        prescriptionId: rx.id,
      });
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to open bill'));
    } finally {
      setBusyId(null);
    }
  };

  // Payment done → hand over the medicine. Dispense is what actually moves stock (consumes the
  // reservation), so it stays a distinct step even though the cashier does both back-to-back.
  const handlePaid = async () => {
    const prescriptionId = paymentOrder?.prescriptionId;
    setPaymentOrder(null);
    if (!prescriptionId) return;
    try {
      await dispense.mutateAsync({ id: prescriptionId });
      toast.success('Paid and dispensed — medicine can be handed over');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Payment recorded, but dispensing failed — dispense from the prescription page'));
    }
  };

  const rows = bills ?? [];

  return (
    <div className="p-6">
      <PageHeader
        icon={Receipt}
        title="Bills"
        subtitle="Prescriptions awaiting payment — settle and hand over the medicine"
        actions={
          <Can permission={P.PHARMACY_VIEW}>
            <Link
              href={`/${orgSlug}/pharmacy`}
              className="inline-flex items-center gap-2 border border-border bg-background text-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-accent transition-colors"
            >
              Full Pharmacy List
            </Link>
          </Can>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading bills…</span>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No bills waiting"
          description="Approved prescriptions appear here for the cashier to settle."
        />
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Rx #</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Patient</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Prescriber</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Items</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Amount</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((b) => (
                <tr key={b.prescription.id} className="hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-xs">
                    <Link href={`/${orgSlug}/pharmacy/${b.prescription.id}`} className="hover:text-primary hover:underline">
                      {b.prescription.prescription_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 font-medium">{b.prescription.patient_name}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">{b.prescription.prescriber_name || '—'}</td>
                  <td className="px-4 py-3.5 text-center text-muted-foreground">{b.line_count}</td>
                  <td className="px-4 py-3.5 text-right font-semibold">
                    {formatCurrency(b.order_total ?? b.estimated_total)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Can permission={P.PAYMENTS_ADD}>
                      <button
                        onClick={() => handleCollect(b)}
                        disabled={busyId === b.prescription.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {busyId === b.prescription.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CreditCard className="h-3.5 w-3.5" />
                        )}
                        Collect Payment
                      </button>
                    </Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paymentOrder && (
        <SplitPaymentModal
          open
          onClose={() => setPaymentOrder(null)}
          onPaymentConfirmed={handlePaid}
          orderId={paymentOrder.id}
          orderNumber={paymentOrder.order_number}
          total={paymentOrder.total}
          tenantSlug={tenantSlug}
          tenantId={tenantId}
        />
      )}
    </div>
  );
}

export default function BillsPageGated() {
  return (
    <PageGuard moduleKey="pharmacy_bills" permission={[P.PAYMENTS_ADD, P.PAYMENTS_VIEW]} label="Bills">
      <BillsPage />
    </PageGuard>
  );
}
