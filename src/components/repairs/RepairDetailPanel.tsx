'use client';

import { useState } from 'react';
import { Trash2, Wrench, Phone, Smartphone, CreditCard } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useParams } from 'next/navigation';
import { useCreateOrder } from '@/hooks/usePOS';
import { SplitPaymentModal } from '@/components/pos/split-payment-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useRepair,
  useUpdateRepair,
  useRemoveRepairPart,
  useSettleRepair,
  REPAIR_STATUSES,
  REPAIR_STATUS_LABELS,
  type RepairStatus,
} from '@/hooks/useRepairs';
import { RepairPartsPicker } from './RepairPartsPicker';
import { RepairStatusBadge } from './RepairStatusBadge';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n);

interface RepairDetailPanelProps {
  jobID: string;
}

export function RepairDetailPanel({ jobID }: RepairDetailPanelProps) {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const tenantSlug = useAuthStore((s) => s.user?.tenant_slug ?? orgSlug);
  const outletId = useAuthStore((s) => s.outlet?.id ?? '');

  const { data, isLoading } = useRepair(jobID);
  const updateRepair = useUpdateRepair();
  const removePart = useRemoveRepairPart();
  const settleRepair = useSettleRepair();
  const createOrder = useCreateOrder();

  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  // POS order created for settlement; drives the payment modal.
  const [settleOrder, setSettleOrder] = useState<{ id: string; number: string; total: number } | null>(null);

  if (isLoading || !data) {
    return <div className="h-64 rounded-2xl bg-muted animate-pulse" />;
  }

  const { job, parts, events } = data;
  const partsTotal = parts.reduce((sum, p) => sum + (parseFloat(p.line_total) || 0), 0);
  const isSettled = !!job.pos_order_id || job.status === 'completed';
  const diagnosisValue = diagnosis ?? job.diagnosis ?? '';

  function setStatus(status: RepairStatus) {
    updateRepair.mutate(
      { jobID, input: { status } },
      {
        onSuccess: () => import('sonner').then(({ toast }) => toast.success('Status updated')),
        onError: () => import('sonner').then(({ toast }) => toast.error('Failed to update status')),
      },
    );
  }

  function saveDiagnosis() {
    updateRepair.mutate(
      { jobID, input: { diagnosis: diagnosisValue } },
      {
        onSuccess: () => {
          import('sonner').then(({ toast }) => toast.success('Diagnosis saved'));
          setDiagnosis(null);
        },
        onError: () => import('sonner').then(({ toast }) => toast.error('Failed to save diagnosis')),
      },
    );
  }

  function confirmRemovePart() {
    if (!removeTarget) return;
    removePart.mutate(
      { jobID, partID: removeTarget },
      {
        onSuccess: () => import('sonner').then(({ toast }) => toast.success('Part removed')),
        onError: () => import('sonner').then(({ toast }) => toast.error('Failed to remove part')),
        onSettled: () => setRemoveTarget(null),
      },
    );
  }

  // Settle = create a POS order from the part lines, then take payment, then link the
  // order back to the repair job. Reuses the shared order + payment flow (no duplication).
  function startSettle() {
    if (parts.length === 0) {
      import('sonner').then(({ toast }) => toast.error('Add at least one part/line before settling'));
      return;
    }
    createOrder.mutate(
      {
        outletId,
        orderSubtype: 'retail',
        customerPhone: job.customer_phone,
        customerName: job.customer_name,
        lines: parts.map((p) => ({
          catalog_item_id: p.inventory_item_id ?? '',
          sku: p.inventory_sku ?? '',
          name: p.description || p.inventory_sku || 'Part',
          quantity: p.quantity,
          unit_price: parseFloat(p.unit_cost) || 0,
          total_price: parseFloat(p.line_total) || 0,
        })),
      },
      {
        onSuccess: (order: any) => {
          setSettleOrder({
            id: order.id,
            number: order.order_number ?? order.id,
            total:
              typeof order.total_amount === 'string'
                ? parseFloat(order.total_amount)
                : order.total_amount ?? partsTotal,
          });
        },
        onError: () => import('sonner').then(({ toast }) => toast.error('Failed to create order')),
      },
    );
  }

  function onPaymentConfirmed() {
    if (!settleOrder) return;
    settleRepair.mutate(
      { jobID, posOrderID: settleOrder.id },
      {
        onSuccess: () => import('sonner').then(({ toast }) => toast.success('Repair settled')),
        onError: () => import('sonner').then(({ toast }) => toast.error('Failed to settle repair')),
        onSettled: () => setSettleOrder(null),
      },
    );
  }

  const field =
    'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Wrench className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-lg leading-none truncate">{job.job_number}</h2>
            <RepairStatusBadge status={job.status} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
            {job.customer_name && <span>{job.customer_name}</span>}
            {job.customer_phone && (
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{job.customer_phone}</span>
            )}
            {job.device_description && (
              <span className="flex items-center gap-1"><Smartphone className="h-3 w-3" />{job.device_description}</span>
            )}
          </div>
        </div>
      </div>

      {job.reported_issue && (
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Reported issue</p>
          <p className="text-sm">{job.reported_issue}</p>
        </div>
      )}

      {/* Status picker */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground">Status</label>
        <div className="flex flex-wrap gap-1.5">
          {REPAIR_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={isSettled || updateRepair.isPending}
              onClick={() => setStatus(s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 ${
                job.status === s
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {REPAIR_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Diagnosis */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground">Diagnosis</label>
        <textarea
          className={`${field} resize-none`}
          rows={2}
          value={diagnosisValue}
          disabled={isSettled}
          onChange={(e) => setDiagnosis(e.target.value)}
          placeholder="Technician diagnosis…"
        />
        {diagnosis !== null && (
          <button
            type="button"
            onClick={saveDiagnosis}
            disabled={updateRepair.isPending}
            className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
          >
            Save diagnosis
          </button>
        )}
      </div>

      {/* Parts */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground">Parts &amp; labor</label>
          <span className="text-sm font-bold tabular-nums">{fmt(partsTotal)}</span>
        </div>

        {parts.length > 0 && (
          <div className="rounded-lg border border-border divide-y divide-border">
            {parts.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.description || p.inventory_sku}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.quantity} × {fmt(parseFloat(p.unit_cost) || 0)}
                  </p>
                </div>
                <span className="font-semibold tabular-nums shrink-0">{fmt(parseFloat(p.line_total) || 0)}</span>
                {!isSettled && (
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(p.id)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!isSettled && <RepairPartsPicker jobID={jobID} />}
      </div>

      {/* Settle */}
      {!isSettled && (
        <button
          type="button"
          onClick={startSettle}
          disabled={createOrder.isPending}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <CreditCard className="h-4 w-4" />
          {createOrder.isPending ? 'Preparing…' : `Settle ${fmt(partsTotal)}`}
        </button>
      )}

      {isSettled && (
        <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-900/10 p-3 text-sm text-green-700 dark:text-green-400 font-medium">
          Settled{job.pos_order_id ? ' via POS order' : ''}.
        </div>
      )}

      {/* Timeline */}
      {events.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Timeline</label>
          <div className="space-y-1.5">
            {events.map((ev) => (
              <div key={ev.id} className="flex gap-2 text-xs">
                <span className="text-muted-foreground shrink-0 w-32">
                  {new Date(ev.created_at).toLocaleString()}
                </span>
                <span className="flex-1">{ev.notes || ev.event_type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remove-part confirm */}
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title="Remove part?"
        description="This removes the part line from the job card."
        confirmLabel="Remove"
        variant="danger"
        loading={removePart.isPending}
        onConfirm={confirmRemovePart}
      />

      {/* Payment modal — reuses the shared SplitPaymentModal against the created POS order */}
      {settleOrder && (
        <SplitPaymentModal
          open
          onClose={() => setSettleOrder(null)}
          orderId={settleOrder.id}
          orderNumber={settleOrder.number}
          total={settleOrder.total}
          tenantSlug={tenantSlug}
          onPaymentConfirmed={onPaymentConfirmed}
        />
      )}
    </div>
  );
}
