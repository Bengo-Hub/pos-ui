'use client';

import { useState } from 'react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Can } from '@/components/auth/can';
import { P } from '@/lib/rbac/permissions';

import {
  usePrescription,
  useDispensePrescription,
  useApprovePrescription,
  useLockPrescription,
  useCheckoutPrescription,
  useRejectPrescription,
  useCancelPrescription,
  useCRMContactSearch,
  useLinkCRMContact,
} from '@/hooks/usePharmacy';
import { usePharmacyWorkflow } from '@/hooks/useClinical';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { ArrowLeft, AlertTriangle, Ban, CheckCircle2, CreditCard, Loader2, Lock, Pill, Printer, Receipt, ShieldCheck, UserPlus, X, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { PrescriptionStatus } from '@/lib/api/pharmacy';
import { useAuthStore } from '@/store/auth';
import { enqueuePrintJob } from '@/lib/pos/print-jobs';
import { SplitPaymentModal } from '@/components/pos/split-payment-modal';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<PrescriptionStatus, string> = {
  pending: 'Pending',
  flagged: 'Flagged — Review Required',
  pharmacist_review: 'Pharmacist Review',
  approved: 'Approved',
  locked: 'Locked for Dispense',
  partially_dispensed: 'Partially Dispensed',
  dispensed: 'Dispensed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

function StatusBadge({ status }: { status: PrescriptionStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border',
        status === 'pending' && 'bg-yellow-500/10 text-yellow-700 border-yellow-400/30 dark:text-yellow-400',
        status === 'flagged' && 'bg-red-500/10 text-red-700 border-red-400/30 dark:text-red-400',
        status === 'pharmacist_review' && 'bg-orange-500/10 text-orange-700 border-orange-400/30 dark:text-orange-400',
        status === 'approved' && 'bg-blue-500/10 text-blue-700 border-blue-400/30 dark:text-blue-400',
        status === 'locked' && 'bg-purple-500/10 text-purple-700 border-purple-400/30 dark:text-purple-400',
        status === 'partially_dispensed' && 'bg-orange-500/10 text-orange-700 border-orange-400/30 dark:text-orange-400',
        status === 'dispensed' && 'bg-green-500/10 text-green-700 border-green-400/30 dark:text-green-400',
        (status === 'cancelled' || status === 'rejected') && 'bg-muted text-muted-foreground border-border',
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── CRM contact link (Phase 8: optional pointer, CRM remains the source of truth) ────────────

function CRMContactLink({ prescriptionId, crmContactId }: { prescriptionId: string; crmContactId?: string }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const { data: contacts } = useCRMContactSearch(query);
  const link = useLinkCRMContact();

  const handleLink = async (contactId: string) => {
    try {
      await link.mutateAsync({ id: prescriptionId, crmContactId: contactId });
      toast.success('Linked to CRM contact');
      setQuery('');
      setOpen(false);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to link CRM contact'));
    }
  };

  const handleUnlink = async () => {
    try {
      await link.mutateAsync({ id: prescriptionId, crmContactId: '' });
      toast.success('Unlinked CRM contact');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to unlink CRM contact'));
    }
  };

  if (crmContactId) {
    return (
      <div>
        <p className="text-xs text-muted-foreground mb-0.5">CRM Contact</p>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium font-mono">{crmContactId}</span>
          <button
            onClick={handleUnlink}
            disabled={link.isPending}
            className="text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
            title="Unlink CRM contact"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <p className="text-xs text-muted-foreground mb-0.5">Link CRM Contact</p>
      <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-1.5">
        <UserPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search name, email or phone…"
          className="w-full bg-transparent text-sm focus:outline-none"
        />
      </div>
      {open && query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg">
          {(contacts ?? []).length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No contacts found</p>
          ) : (
            (contacts ?? []).map((c) => (
              <button
                key={c.id}
                onClick={() => handleLink(c.id)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <span className="font-medium">
                  {c.first_name} {c.last_name}
                </span>
                {c.phone && <span className="text-muted-foreground ml-2 text-xs">{c.phone}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function PrescriptionDetailPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const id = params?.id as string;

  const { data: rx, isLoading } = usePrescription(id);
  // Dispensing-workflow mode (Settings -> Pharmacy Workflow): 'direct' = the prescriber also
  // takes payment and hands over the medicine; 'billing' = payment/handover moves to a shared
  // Bills queue any cashier can settle — this page's Dispense/Checkout controls are then hidden
  // in favor of directing the patient to that desk. Defaults to 'direct' while loading so the
  // page doesn't flash-hide controls on a slow settings fetch.
  const { data: workflowConfig } = usePharmacyWorkflow();
  const isBillingMode = workflowConfig?.pharmacy_workflow_mode === 'billing';
  const dispense = useDispensePrescription();
  const approve = useApprovePrescription();
  const lock = useLockPrescription();
  const checkout = useCheckoutPrescription();
  const reject = useRejectPrescription();
  const cancelRx = useCancelPrescription();
  const { can } = usePermissions();
  const [overrideReason, setOverrideReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showDispense, setShowDispense] = useState(false);
  const [dispenseQty, setDispenseQty] = useState<Record<string, number>>({});
  const [printing, setPrinting] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<{ id: string; order_number: string; total: number } | null>(null);
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? '');
  const tenantSlug = useAuthStore((s) => s.user?.tenant_slug ?? '');

  const canOverrideInteraction = can(P.PHARMACY_INTERACTION_OVERRIDE);

  const handlePrintLabel = async () => {
    if (!rx || !tenantId) return;
    setPrinting(true);
    try {
      const res = await enqueuePrintJob(tenantId, { job_type: 'dispensing_label', prescription_id: rx.id });
      if (!res.agent_online) {
        toast.error('No print agent online for this outlet');
      } else if (res.jobs.length === 0) {
        toast.error('No dispensed lines to print labels for');
      } else {
        toast.success('Dispensing label sent to printer');
      }
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to print dispensing label'));
    } finally {
      setPrinting(false);
    }
  };

  const openDispense = () => {
    if (!rx) return;
    const initial: Record<string, number> = {};
    rx.lines.forEach((l) => {
      initial[l.id] = l.quantity_prescribed - l.quantity_dispensed;
    });
    setDispenseQty(initial);
    setShowDispense(true);
  };

  const handleDispense = async () => {
    if (!rx) return;
    const lines = Object.entries(dispenseQty)
      .filter(([, qty]) => qty > 0)
      .map(([line_id, quantity]) => ({ line_id, quantity }));
    if (lines.length === 0) {
      toast.error('Enter a quantity to dispense for at least one drug line');
      return;
    }
    try {
      const updated = await dispense.mutateAsync({ id: rx.id, options: { lines } });
      setShowDispense(false);
      toast.success(updated.status === 'partially_dispensed' ? 'Partial dispense recorded' : 'Prescription dispensed');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to dispense prescription'));
    }
  };

  const handleApprove = async (reason?: string) => {
    if (!rx) return;
    try {
      await approve.mutateAsync({ id: rx.id, overrideReason: reason });
      toast.success('Prescription approved');
      setOverrideReason('');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to approve prescription'));
    }
  };

  const handleLock = async () => {
    if (!rx) return;
    try {
      await lock.mutateAsync(rx.id);
      toast.success('Prescription locked for dispensing');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to lock prescription'));
    }
  };

  const handleCheckout = async () => {
    if (!rx) return;
    try {
      const res = await checkout.mutateAsync(rx.id);
      setPaymentOrder({ id: res.order_id, order_number: res.order_number, total: res.total_amount });
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to start checkout'));
    }
  };

  const handleReject = async () => {
    if (!rx || !rejectReason.trim()) return;
    try {
      await reject.mutateAsync({ id: rx.id, reason: rejectReason.trim() });
      toast.success('Prescription rejected');
      setShowReject(false);
      setRejectReason('');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to reject prescription'));
    }
  };

  const handleCancel = async () => {
    if (!rx || !cancelReason.trim()) return;
    try {
      await cancelRx.mutateAsync({ id: rx.id, reason: cancelReason.trim() });
      toast.success('Prescription cancelled');
      setShowCancel(false);
      setCancelReason('');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to cancel prescription'));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading prescription…</span>
      </div>
    );
  }

  if (!rx) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
        <Pill className="h-10 w-10 opacity-30" />
        <p className="font-medium">Prescription not found</p>
        <Link href={`/${orgSlug}/pharmacy`} className="text-sm text-primary underline">
          Back to Pharmacy
        </Link>
      </div>
    );
  }

  const fieldCls = 'text-sm text-foreground font-medium';
  const labelCls = 'text-xs text-muted-foreground mb-0.5';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back + Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-3">
          <Link
            href={`/${orgSlug}/pharmacy`}
            className="h-9 w-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mt-0.5 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold font-mono">{rx.prescription_number}</h1>
              <StatusBadge status={rx.status} />
              {(rx.status === 'approved' || rx.status === 'locked') && rx.metadata?.reservation_id && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-700 border border-blue-400/30 dark:text-blue-400">
                  <ShieldCheck className="h-3 w-3" />
                  Stock Reserved
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Created {new Date(rx.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {rx.status === 'pending' && (
            <Can permission={P.PHARMACY_APPROVE}>
              <button
                onClick={() => handleApprove()}
                disabled={approve.isPending}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve
              </button>
            </Can>
          )}
          {rx.status === 'approved' && (
            // Gated on PHARMACY_APPROVE (not CHANGE) to match the backend route, which requires
            // pos.pharmacy.approve — a role with only CHANGE (e.g. pharmacy_technician) would
            // otherwise see this button and get a 403 clicking it.
            <Can permission={P.PHARMACY_APPROVE}>
              <button
                onClick={handleLock}
                disabled={lock.isPending}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {lock.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Lock for Dispense
              </button>
            </Can>
          )}
          {!isBillingMode && (rx.status === 'approved' || rx.status === 'locked' || rx.status === 'partially_dispensed') && (
            <Can permission={P.PHARMACY_CHANGE}>
              <button
                onClick={openDispense}
                disabled={dispense.isPending}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {dispense.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Pill className="h-4 w-4" />
                )}
                Dispense
              </button>
            </Can>
          )}
          {!['dispensed', 'partially_dispensed', 'rejected', 'cancelled'].includes(rx.status) && (
            <Can permission={P.PHARMACY_CHANGE}>
              <button
                onClick={() => setShowReject((v) => !v)}
                disabled={reject.isPending}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm font-semibold hover:bg-destructive/10 transition-colors disabled:opacity-50"
              >
                <Ban className="h-4 w-4" />
                Reject
              </button>
            </Can>
          )}
          {!['dispensed', 'partially_dispensed', 'rejected', 'cancelled'].includes(rx.status) && (
            <Can permission={P.PHARMACY_CHANGE}>
              <button
                onClick={() => setShowCancel((v) => !v)}
                disabled={cancelRx.isPending}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-muted-foreground text-sm font-semibold hover:bg-accent transition-colors disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                Cancel Rx
              </button>
            </Can>
          )}
          {!isBillingMode && rx.status === 'dispensed' && !rx.order_id && (
            <Can permission={P.PHARMACY_CHANGE}>
              <button
                onClick={handleCheckout}
                disabled={checkout.isPending}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkout.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Checkout &amp; Collect Payment
              </button>
            </Can>
          )}
          {(rx.status === 'dispensed' || rx.status === 'partially_dispensed') && (
            <Can permission={P.PHARMACY_CHANGE}>
              <button
                onClick={handlePrintLabel}
                disabled={printing}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Print Label
              </button>
            </Can>
          )}
        </div>
      </div>

      {/* Billing-mode guidance — once approved, this outlet's dispensing/payment happens at the
          shared Bills desk (any cashier), not here, so point staff there instead of leaving them
          looking for a Dispense/Checkout button that's intentionally hidden. */}
      {isBillingMode && ['approved', 'locked', 'partially_dispensed'].includes(rx.status) && (
        <div className="bg-blue-500/5 border border-blue-400/30 rounded-2xl p-4 mb-5 flex items-center gap-3">
          <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
          <p className="text-sm text-muted-foreground flex-1">
            This outlet uses <span className="font-semibold text-foreground">Billing mode</span> — direct the
            patient to the Cashier / Bills Desk to pay and collect. Dispensing happens there, not here.
          </p>
          <Link
            href={`/${orgSlug}/bills`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shrink-0"
          >
            Go to Bills Desk
          </Link>
        </div>
      )}

      {/* Reject reason (inline, toggled by the Reject button above) */}
      {showReject && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-bold text-destructive mb-2">Reject Prescription</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Any stock reserved for this prescription will be released. This cannot be undone.
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (required)…"
            rows={2}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-destructive/40"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowReject(false)}
              className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={reject.isPending || !rejectReason.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Confirm Rejection
            </button>
          </div>
        </div>
      )}

      {/* Cancel reason (inline, toggled by the Cancel Rx button above) — administrative
          withdrawal, distinct from Reject's clinical refusal. */}
      {showCancel && (
        <div className="bg-muted/40 border border-border rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-bold mb-2">Cancel Prescription</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Any stock reserved for this prescription will be released. This cannot be undone.
          </p>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation (required)…"
            rows={2}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowCancel(false)}
              className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleCancel}
              disabled={cancelRx.isPending || !cancelReason.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelRx.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Confirm Cancellation
            </button>
          </div>
        </div>
      )}

      {/* Dispense (toggled by the Dispense button above) — quantities default to the full
          remaining amount per line; edit any down to record a partial dispense instead. */}
      {showDispense && rx && (
        <div
          className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowDispense(false)}
        >
          <div
            className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                <Pill className="h-5 w-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-base leading-tight">Dispense Prescription</h2>
                <p className="text-xs text-muted-foreground">
                  Reduce a quantity below the full remaining amount to record a partial dispense.
                </p>
              </div>
            </div>
            <div className="space-y-2.5 mb-5 max-h-72 overflow-y-auto">
              {rx.lines
                .filter((l) => l.quantity_dispensed < l.quantity_prescribed)
                .map((line) => {
                  const remaining = line.quantity_prescribed - line.quantity_dispensed;
                  const value = dispenseQty[line.id] ?? remaining;
                  return (
                    <div
                      key={line.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{line.drug_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[line.dosage, line.form].filter(Boolean).join(' · ')} — {remaining} remaining of{' '}
                          {line.quantity_prescribed}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={remaining}
                        value={value}
                        onChange={(e) => {
                          const n = Math.min(Math.max(0, Number(e.target.value) || 0), remaining);
                          setDispenseQty((prev) => ({ ...prev, [line.id]: n }));
                        }}
                        className="w-20 shrink-0 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                  );
                })}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDispense(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDispense}
                disabled={dispense.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {dispense.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pill className="h-4 w-4" />}
                Confirm Dispense
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment collection for the checkout order just created above */}
      {paymentOrder && (
        <SplitPaymentModal
          open
          onClose={() => setPaymentOrder(null)}
          onPaymentConfirmed={() => setPaymentOrder(null)}
          orderId={paymentOrder.id}
          orderNumber={paymentOrder.order_number}
          total={paymentOrder.total}
          tenantSlug={tenantSlug}
          tenantId={tenantId}
        />
      )}

      {/* Drug-interaction / allergy warning — requires an override reason to approve past it.
          pharmacist_review is the strictest tier (contraindicated finding): it additionally
          requires the pos.pharmacy.interaction_override permission, enforced both here (so the
          button disables with an explanation instead of a confusing 403) and server-side. */}
      {(rx.status === 'flagged' || rx.status === 'pharmacist_review') && (
        <div className="bg-red-500/5 border border-red-400/30 rounded-2xl p-5 mb-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-sm font-bold text-red-700 dark:text-red-400 mb-1">
                {rx.status === 'pharmacist_review'
                  ? 'Contraindicated drug interaction / allergy detected'
                  : 'Drug interaction / allergy flag detected'}
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                {rx.status === 'pharmacist_review'
                  ? 'This is the strictest interaction tier. A pharmacist holding interaction-override rights must document a clinical justification before this prescription can be approved.'
                  : 'A pharmacist must document a clinical justification before this prescription can be approved.'}
              </p>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Override reason (required to approve)…"
                rows={2}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-red-400/40"
              />
              {rx.status === 'pharmacist_review' && !canOverrideInteraction && (
                <p className="text-xs text-destructive mb-3">
                  You don&apos;t hold the interaction-override permission — a senior pharmacist must approve this one.
                </p>
              )}
              <button
                onClick={() => handleApprove(overrideReason)}
                disabled={
                  approve.isPending ||
                  !overrideReason.trim() ||
                  (rx.status === 'pharmacist_review' && !canOverrideInteraction)
                }
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Approve with Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prescriber + Patient */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
        {/* Prescriber */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Prescriber</h2>
          <div className="space-y-3">
            <div>
              <p className={labelCls}>Name</p>
              <p className={fieldCls}>{rx.prescriber_name}</p>
            </div>
            <div>
              <p className={labelCls}>License #</p>
              <p className={fieldCls}>{rx.prescriber_license}</p>
            </div>
          </div>
        </div>

        {/* Patient */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Patient</h2>
          <div className="space-y-3">
            <div>
              <p className={labelCls}>Name</p>
              <p className={fieldCls}>{rx.patient_name}</p>
            </div>
            {rx.patient_dob && (
              <div>
                <p className={labelCls}>Date of Birth</p>
                <p className={fieldCls}>{new Date(rx.patient_dob).toLocaleDateString()}</p>
              </div>
            )}
            {rx.patient_id_number && (
              <div>
                <p className={labelCls}>ID Number</p>
                <p className={fieldCls}>{rx.patient_id_number}</p>
              </div>
            )}
            <CRMContactLink prescriptionId={rx.id} crmContactId={rx.metadata?.crm_contact_id} />
          </div>
        </div>
      </div>

      {/* Notes */}
      {rx.notes && (
        <div className="bg-card rounded-2xl border border-border p-5 mb-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Notes</h2>
          <p className="text-sm text-muted-foreground">{rx.notes}</p>
        </div>
      )}

      {/* Drug lines table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold">Drug Lines</h2>
        </div>
        {rx.lines && rx.lines.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Drug</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Dosage</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Form</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">Instructions</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Prescribed</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Dispensed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rx.lines.map((line) => (
                <tr key={line.id} className="hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-3.5 font-medium">{line.drug_name}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">{line.dosage}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">{line.form}</td>
                  <td className="px-4 py-3.5 text-muted-foreground text-xs hidden sm:table-cell max-w-[200px] truncate">
                    {line.instructions}
                  </td>
                  <td className="px-4 py-3.5 text-center font-mono">{line.quantity_prescribed}</td>
                  <td className="px-4 py-3.5 text-center font-mono">
                    <span
                      className={cn(
                        'font-semibold',
                        line.quantity_dispensed === 0 && 'text-muted-foreground',
                        line.quantity_dispensed > 0 &&
                          line.quantity_dispensed < line.quantity_prescribed &&
                          'text-orange-600',
                        line.quantity_dispensed >= line.quantity_prescribed && 'text-green-600',
                      )}
                    >
                      {line.quantity_dispensed}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            No drug lines
          </div>
        )}
      </div>
    </div>
  );
}

export default function PrescriptionDetailPageGated() {
  return (
    <ModuleGate moduleKey="pharmacy" fallback={<ModuleUnavailablePage moduleKey="pharmacy" />}>
      <PrescriptionDetailPage />
    </ModuleGate>
  );
}
