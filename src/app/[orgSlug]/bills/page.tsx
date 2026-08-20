'use client';

import { useMemo, useState } from 'react';
import { PageGuard } from '@/components/auth/page-guard';
import { Can } from '@/components/auth/can';
import { P } from '@/lib/rbac/permissions';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { usePharmacyBills } from '@/hooks/useClinical';
import { useCheckoutPrescription, useDispensePrescription } from '@/hooks/usePharmacy';
import { SplitPaymentModal } from '@/components/pos/split-payment-modal';
import { useAuthStore } from '@/store/auth';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { PharmacyBill } from '@/lib/api/clinical';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { buildBillsColumns } from './bills-columns';

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
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';

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
  const columns = useMemo(
    () => buildBillsColumns({ orgSlug, currency, busyId, onCollect: handleCollect }),
    [orgSlug, currency, busyId],
  );

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

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(b) => b.prescription.id}
        loading={isLoading}
        loadingRows={8}
        storageKey="pharmacy-bills-col-prefs"
        emptyState={
          <EmptyState
            icon={Receipt}
            title="No bills waiting"
            description="Approved prescriptions appear here for the cashier to settle."
          />
        }
      />

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
