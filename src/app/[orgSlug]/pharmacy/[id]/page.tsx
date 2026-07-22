'use client';

import { useState } from 'react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import {
  usePrescription,
  useDispensePrescription,
  useApprovePrescription,
  useLockPrescription,
} from '@/hooks/usePharmacy';
import { cn } from '@/lib/utils';
import { ArrowLeft, AlertTriangle, CheckCircle2, Loader2, Lock, Pill, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { Prescription, PrescriptionStatus } from '@/lib/api/pharmacy';

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

// ─── Page ─────────────────────────────────────────────────────────────────────

function PrescriptionDetailPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const id = params?.id as string;

  const { data: rx, isLoading } = usePrescription(id);
  const dispense = useDispensePrescription();
  const approve = useApprovePrescription();
  const lock = useLockPrescription();
  const [overrideReason, setOverrideReason] = useState('');

  const handleDispense = async () => {
    if (!rx) return;
    try {
      await dispense.mutateAsync(rx.id);
      toast.success('Prescription dispensed');
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
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Created {new Date(rx.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(rx.status === 'pending' || rx.status === 'pharmacist_review') && (
            <button
              onClick={() => handleApprove()}
              disabled={approve.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Approve
            </button>
          )}
          {rx.status === 'approved' && (
            <button
              onClick={handleLock}
              disabled={lock.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {lock.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Lock for Dispense
            </button>
          )}
          {(rx.status === 'approved' || rx.status === 'locked') && (
            <button
              onClick={handleDispense}
              disabled={dispense.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {dispense.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Pill className="h-4 w-4" />
              )}
              Dispense All
            </button>
          )}
        </div>
      </div>

      {/* Drug-interaction / allergy warning — requires an override reason to approve past it */}
      {rx.status === 'flagged' && (
        <div className="bg-red-500/5 border border-red-400/30 rounded-2xl p-5 mb-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-sm font-bold text-red-700 dark:text-red-400 mb-1">
                Drug interaction / allergy flag detected
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                A pharmacist must document a clinical justification before this prescription can be approved.
              </p>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Override reason (required to approve)…"
                rows={2}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-red-400/40"
              />
              <button
                onClick={() => handleApprove(overrideReason)}
                disabled={approve.isPending || !overrideReason.trim()}
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
