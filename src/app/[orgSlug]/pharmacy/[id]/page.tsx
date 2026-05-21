'use client';

import { usePrescription, useDispensePrescription } from '@/hooks/usePharmacy';
import { cn } from '@/lib/utils';
import { ArrowLeft, Loader2, Pill } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import type { Prescription } from '@/lib/api/pharmacy';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Prescription['status'], string> = {
  pending: 'Pending',
  partially_dispensed: 'Partially Dispensed',
  dispensed: 'Dispensed',
  cancelled: 'Cancelled',
};

function StatusBadge({ status }: { status: Prescription['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border',
        status === 'pending' && 'bg-yellow-500/10 text-yellow-700 border-yellow-400/30 dark:text-yellow-400',
        status === 'partially_dispensed' && 'bg-orange-500/10 text-orange-700 border-orange-400/30 dark:text-orange-400',
        status === 'dispensed' && 'bg-green-500/10 text-green-700 border-green-400/30 dark:text-green-400',
        status === 'cancelled' && 'bg-muted text-muted-foreground border-border',
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PrescriptionDetailPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const id = params?.id as string;

  const { data: rx, isLoading } = usePrescription(id);
  const dispense = useDispensePrescription();

  const handleDispense = async () => {
    if (!rx) return;
    try {
      await dispense.mutateAsync(rx.id);
      toast.success('Prescription dispensed');
    } catch {
      toast.error('Failed to dispense prescription');
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

        {rx.status === 'pending' && (
          <button
            onClick={handleDispense}
            disabled={dispense.isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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
